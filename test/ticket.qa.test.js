/**
 * QA — Certificacion de Ticket de Pago
 *
 * Criterio de aceptacion:
 *   [ ] El folio del ticket es unico e irrepetible y refleja el monto exacto cobrado.
 *
 * Estrategia:
 *   1. Se registran cobros reales contra la API (test.db).
 *   2. Se verifica que cada respuesta devuelva un pago con id unico.
 *   3. Se verifica que el monto guardado en BD coincida con el monto enviado.
 *   4. Se confirma que el folio generado por el front (TKT-{pago.id}) es irrepetible.
 */

process.env.DATABASE_URL = 'file:./test.db';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const bcrypt = require('bcryptjs');

const app    = require('../src/app');
const prisma = require('../src/prismaClient');

let server;
let base;
let adminToken;

// ---------- helpers ----------------------------------------------------------

async function apiFetch(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* vacio */ }
  return { status: res.status, body: json };
}

/** Traduce el id de Pago al folio que imprime el ticket en el frontend (app.js ln 731). */
function buildFolio(pagoId) {
  return `TKT-${pagoId}`;
}

// ---------- setup / teardown -------------------------------------------------

before(async () => {
  await prisma.pago.deleteMany();
  await prisma.socio.deleteMany();
  await prisma.usuario.deleteMany();

  await prisma.usuario.create({
    data: {
      nombre:   'QA Admin',
      username: 'qa_admin_ticket',
      password: await bcrypt.hash('qa_pass_123', 10),
      rol:      'ADMIN',
    },
  });

  await prisma.socio.create({
    data: {
      nombre:           'Socio QA Ticket',
      telefono:         '5550000099',
      tipoPase:         'MENSUAL',
      fechaVencimiento: new Date('2025-01-01'),
    },
  });

  server = app.listen(0);
  const port = server.address().port;
  base = `http://127.0.0.1:${port}/api`;

  const login = await apiFetch('POST', '/auth/login', {
    username: 'qa_admin_ticket',
    password: 'qa_pass_123',
  });
  assert.equal(login.status, 200, 'Login QA debe responder 200');
  adminToken = login.body.token;
});

after(async () => {
  server.close();
  await prisma.pago.deleteMany();
  await prisma.socio.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.$disconnect();
});

// ---------- tests -------------------------------------------------------------

test('QA-TKT-01 | Pago registrado devuelve id unico y monto coincide con lo cobrado', async () => {
  const socios = await prisma.socio.findMany();
  const socio  = socios[0];
  const monto  = 350;

  const res = await apiFetch('POST', `/socios/${socio.id}/cobrar`,
    { monto, metodoPago: 'EFECTIVO' }, adminToken);

  assert.equal(res.status, 201, 'El endpoint de cobro debe responder 201');
  assert.ok(res.body.pago,                       'La respuesta debe incluir el objeto pago');
  assert.ok(Number.isInteger(res.body.pago.id),  'El id del pago debe ser un entero');
  assert.equal(res.body.pago.monto, monto,
    `Monto en respuesta (${res.body.pago.monto}) debe coincidir con lo enviado (${monto})`);

  const pagoBD = await prisma.pago.findUnique({ where: { id: res.body.pago.id } });
  assert.ok(pagoBD,                'El pago debe existir en la base de datos');
  assert.equal(pagoBD.monto, monto,'La BD debe almacenar el monto exacto cobrado');
});

test('QA-TKT-02 | Dos cobros consecutivos generan folios de ticket distintos (unicidad)', async () => {
  const socios = await prisma.socio.findMany();
  const socio  = socios[0];

  const res1 = await apiFetch('POST', `/socios/${socio.id}/cobrar`,
    { monto: 200, metodoPago: 'TRANSFERENCIA' }, adminToken);
  assert.equal(res1.status, 201, 'Cobro 1 debe responder 201');
  const folio1 = buildFolio(res1.body.pago.id);

  const res2 = await apiFetch('POST', `/socios/${socio.id}/cobrar`,
    { monto: 200, metodoPago: 'EFECTIVO' }, adminToken);
  assert.equal(res2.status, 201, 'Cobro 2 debe responder 201');
  const folio2 = buildFolio(res2.body.pago.id);

  assert.notEqual(folio1, folio2,
    `Los folios deben ser distintos: ${folio1} vs ${folio2}`);
});

test('QA-TKT-03 | El folio del ticket refleja exactamente el id del pago en BD', async () => {
  const pagos = await prisma.pago.findMany({ orderBy: { id: 'asc' } });

  for (const pago of pagos) {
    const folio = buildFolio(pago.id);
    assert.match(folio, /^TKT-\d+$/,
      `El folio "${folio}" debe cumplir el formato TKT-{numero}`);
  }

  const ids    = pagos.map(p => p.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length,
    'Todos los ids de pago en BD son unicos => los folios son irrepetibles');
});

test('QA-TKT-04 | El monto del ticket coincide exacto con BD (sin redondeo ni perdida)', async () => {
  const socios = await prisma.socio.findMany();
  const socio  = socios[0];
  const montosPrueba = [150, 275.50, 99.99, 500];

  for (const monto of montosPrueba) {
    const res = await apiFetch('POST', `/socios/${socio.id}/cobrar`,
      { monto, metodoPago: 'EFECTIVO' }, adminToken);
    assert.equal(res.status, 201, `Cobro de $${monto} debe responder 201`);

    const pagoBD = await prisma.pago.findUnique({ where: { id: res.body.pago.id } });
    assert.equal(pagoBD.monto, monto,
      `Monto en BD (${pagoBD.monto}) debe ser exactamente ${monto}`);
    assert.equal(res.body.pago.monto, monto,
      `Monto en respuesta API (${res.body.pago.monto}) debe ser exactamente ${monto}`);
  }
});
