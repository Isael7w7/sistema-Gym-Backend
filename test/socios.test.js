// Tests automatizados de la API de socios.
// Usan una BD SQLite aparte (prisma/test.db) para no tocar prisma/dev.db.

process.env.DATABASE_URL = 'file:./test.db';

const path = require('node:path');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const { test, before, after, beforeEach } = require('node:test');

// Crea/actualiza el esquema de la BD de tests a partir de prisma/schema.prisma
execSync('npx prisma db push --skip-generate --accept-data-loss', {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env },
  stdio: 'pipe',
});

const app = require('../src/app');
const prisma = require('../src/prismaClient');

const MS_POR_DIA = 1000 * 60 * 60 * 24;

let server;
let base;

async function api(metodo, ruta, body) {
  const res = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.on('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.pago.deleteMany();
  await prisma.socio.deleteMany();
});

test('la BD de tests es prisma/test.db y no toca prisma/dev.db', async () => {
  const filas = await prisma.$queryRawUnsafe('PRAGMA database_list');
  const archivo = String(filas[0].file || '').replace(/\\/g, '/');
  assert.ok(archivo.endsWith('/test.db'), `esperaba .../test.db, obtuve: ${archivo}`);
  assert.ok(!archivo.endsWith('/dev.db'), 'los tests no deben escribir en dev.db');
});

test('GET /api/docs: Swagger UI responde HTML', async () => {
  const res = await fetch(`${base}/api-docs`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /swagger/i);
});

test('GET /api-docs.json: expone el documento OpenAPI con los 3 endpoints', async () => {
  const { status, body } = await api('GET', '/api-docs.json');
  assert.equal(status, 200);
  assert.equal(body.openapi, '3.0.3');
  assert.ok(body.paths['/api/socios'].get);
  assert.ok(body.paths['/api/socios'].post);
  assert.ok(body.paths['/api/socios/{id}/cobrar'].post);
});

test('GET /api/socios: devuelve lista vacía cuando no hay socios', async () => {
  const { status, body } = await api('GET', '/api/socios');
  assert.equal(status, 200);
  assert.deepEqual(body, []);
});

test('POST /api/socios: crea un socio con vencimiento y estatus calculados', async () => {
  const { status, body } = await api('POST', '/api/socios', {
    nombre: '  Ana Perez  ',
    telefono: '555-1234',
    tipoPase: 'MENSUAL',
  });

  assert.equal(status, 201);
  assert.ok(Number.isInteger(body.id) && body.id > 0, `id inválido: ${body.id}`);
  assert.equal(body.nombre, 'Ana Perez'); // trim aplicado
  assert.equal(body.telefono, '555-1234');
  assert.equal(body.tipoPase, 'MENSUAL');
  assert.equal(body.estatusColor, 'verde');

  // El controller vence a las 23:59:59.999 de hoy + 30 días
  const esperado = new Date();
  esperado.setHours(23, 59, 59, 999);
  esperado.setDate(esperado.getDate() + 30);
  assert.equal(
    new Date(body.fechaVencimiento).getTime(),
    esperado.getTime(),
    'MENSUAL debe vencer a fin de día de hoy + 30 días'
  );
  const dias = Math.floor((esperado.getTime() - Date.now()) / MS_POR_DIA);
  assert.ok(dias >= 29 && dias <= 30, `diasRestantes esperado ~30, obtuve ${dias}`);
  assert.equal(body.diasRestantes, dias);

  const guardado = await prisma.socio.findUnique({ where: { id: body.id } });
  assert.equal(guardado.nombre, 'Ana Perez');
});

test('POST /api/socios: automatiza la fecha con los días exactos de cada pase (+1/+7/+30/+365)', async () => {
  const casos = [
    ['VISITA', 1],
    ['SEMANAL', 7],
    ['MENSUAL', 30],
    ['ANUAL', 365],
  ];

  for (const [tipoPase, dias] of casos) {
    const { status, body } = await api('POST', '/api/socios', {
      nombre: `Socio ${tipoPase}`,
      telefono: `555-${dias}`, // único por socio: la BD rechaza teléfonos repetidos
      tipoPase,
    });
    assert.equal(status, 201);

    const esperado = new Date();
    esperado.setHours(23, 59, 59, 999);
    esperado.setDate(esperado.getDate() + dias);

    assert.equal(
      new Date(body.fechaVencimiento).getTime(),
      esperado.getTime(),
      `${tipoPase} debe sumar exactamente +${dias} días`
    );
  }

  assert.equal(await prisma.socio.count(), 4);
});

test('POST /api/socios: ignora la fecha manual y usa el cálculo automático', async () => {
  const { status, body } = await api('POST', '/api/socios', {
    nombre: 'Fecha Manual',
    telefono: '555-1111',
    tipoPase: 'VISITA',
    fechaInicio: '2000-01-01T00:00:00.000Z',
    fechaVencimiento: '2000-01-02T00:00:00.000Z',
  });

  assert.equal(status, 201);

  const esperado = new Date();
  esperado.setHours(23, 59, 59, 999);
  esperado.setDate(esperado.getDate() + 1);

  assert.equal(
    new Date(body.fechaVencimiento).getTime(),
    esperado.getTime(),
    'la fecha del body debe ignorarse y calcularse +1 día (VISITA)'
  );
  assert.ok(
    Math.abs(Date.now() - new Date(body.fechaInicio).getTime()) < 60_000,
    'fechaInicio debe ser la del alta, no la enviada'
  );
});

test('POST /api/socios: rechaza nombre vacío con 400', async () => {
  const { status, body } = await api('POST', '/api/socios', {
    nombre: '   ',
    telefono: '555-1234',
    tipoPase: 'MENSUAL',
  });
  assert.equal(status, 400);
  assert.match(body.error, /nombre/i);
  assert.equal(await prisma.socio.count(), 0);
});

test('POST /api/socios: rechaza teléfono faltante con 400', async () => {
  const { status, body } = await api('POST', '/api/socios', {
    nombre: 'Ana',
    tipoPase: 'MENSUAL',
  });
  assert.equal(status, 400);
  assert.match(body.error, /telefono/i);
});

test('POST /api/socios: rechaza tipoPase inválido con 400', async () => {
  const { status, body } = await api('POST', '/api/socios', {
    nombre: 'Ana',
    telefono: '555-1234',
    tipoPase: 'TRIMESTRAL',
  });
  assert.equal(status, 400);
  assert.match(body.error, /tipoPase/i);
  assert.match(body.error, /VISITA/);
});

test('POST /api/socios: rechaza un teléfono duplicado con 409', async () => {
  const primero = await api('POST', '/api/socios', {
    nombre: 'Ana Perez',
    telefono: '555-1234',
    tipoPase: 'MENSUAL',
  });
  assert.equal(primero.status, 201);

  // Distinto en el body, igual después del trim: sigue siendo el mismo contacto.
  const segundo = await api('POST', '/api/socios', {
    nombre: 'Luis Duplicado',
    telefono: '  555-1234  ',
    tipoPase: 'ANUAL',
  });

  assert.equal(segundo.status, 409);
  assert.match(segundo.body.error, /telefono/i);
  assert.equal(await prisma.socio.count(), 1, 'el duplicado no debe guardarse');

  const guardado = await prisma.socio.findUnique({ where: { telefono: '555-1234' } });
  assert.equal(guardado.nombre, 'Ana Perez', 'el primer socio debe conservarse');
});

test('la BD aplica NOT NULL en los campos de contacto', async () => {
  // Teléfono nulo: lo bloquea la base de datos, no solo la validación de la API.
  await assert.rejects(
    () =>
      prisma.$executeRawUnsafe(
        'INSERT INTO Socio (nombre, telefono, tipoPase, fechaVencimiento) VALUES (?, ?, ?, ?)',
        'Sin Telefono',
        null,
        'MENSUAL',
        new Date().toISOString()
      ),
    /NOT NULL|constraint/i
  );

  // Nombre nulo, mismo criterio.
  await assert.rejects(
    () =>
      prisma.$executeRawUnsafe(
        'INSERT INTO Socio (nombre, telefono, tipoPase, fechaVencimiento) VALUES (?, ?, ?, ?)',
        null,
        '555-0001',
        'MENSUAL',
        new Date().toISOString()
      ),
    /NOT NULL|constraint/i
  );

  assert.equal(await prisma.socio.count(), 0);
});

test('la BD impide teléfonos duplicados con el índice único de la migración', async () => {
  const indices = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'Socio'"
  );
  assert.ok(
    indices.some((i) => i.name === 'Socio_telefono_key'),
    `falta el índice único Socio_telefono_key, obtuve: ${JSON.stringify(indices)}`
  );

  await prisma.socio.create({
    data: {
      nombre: 'Original',
      telefono: '555-7777',
      tipoPase: 'MENSUAL',
      fechaVencimiento: new Date(),
    },
  });

  // Insert directo en la BD: la restricción vive en SQLite, no en el código.
  await assert.rejects(
    () =>
      prisma.$executeRawUnsafe(
        'INSERT INTO Socio (nombre, telefono, tipoPase, fechaVencimiento) VALUES (?, ?, ?, ?)',
        'Duplicado',
        '555-7777',
        'ANUAL',
        new Date().toISOString()
      ),
    /UNIQUE|constraint/i
  );

  assert.equal(await prisma.socio.count(), 1);
});

test('GET /api/socios: lista ordenada por fecha de vencimiento ascendente', async () => {
  await api('POST', '/api/socios', { nombre: 'Anual', telefono: '1', tipoPase: 'ANUAL' });
  await api('POST', '/api/socios', { nombre: 'Semanal', telefono: '2', tipoPase: 'SEMANAL' });

  const { status, body } = await api('GET', '/api/socios');
  assert.equal(status, 200);
  assert.equal(body.length, 2);
  assert.equal(body[0].nombre, 'Semanal');
  assert.equal(body[1].nombre, 'Anual');
  assert.ok(
    new Date(body[0].fechaVencimiento) <= new Date(body[1].fechaVencimiento),
    'el más próximo a vencer debe ir primero'
  );
});

test('POST /api/socios/:id/cobrar: registra el pago y reinicia la vigencia desde la fecha de cobro', async () => {
  const creado = await api('POST', '/api/socios', {
    nombre: 'Carlos Ruiz',
    telefono: '555-9999',
    tipoPase: 'SEMANAL',
  });

  // Vigencia futura artificial a 100 días: si la regla acumulara, el cobro daría hoy + 107 días.
  const vigenciaLejana = new Date();
  vigenciaLejana.setHours(23, 59, 59, 999);
  vigenciaLejana.setDate(vigenciaLejana.getDate() + 100);
  await prisma.socio.update({
    where: { id: creado.body.id },
    data: { fechaVencimiento: vigenciaLejana },
  });

  const { status, body } = await api('POST', `/api/socios/${creado.body.id}/cobrar`, {
    monto: 150,
    metodoPago: 'EFECTIVO',
  });

  assert.equal(status, 201);
  assert.equal(body.mensaje, 'Cobro registrado y membresia renovada');
  assert.equal(body.pago.monto, 150);
  assert.equal(body.pago.metodoPago, 'EFECTIVO');
  assert.equal(body.pago.socioId, creado.body.id);

  // Reinicio desde la fecha de cobro: +7 días (SEMANAL) contados desde hoy, sin acumular lo anterior.
  const vencimientoEsperado = new Date();
  vencimientoEsperado.setHours(23, 59, 59, 999);
  vencimientoEsperado.setDate(vencimientoEsperado.getDate() + 7);
  assert.equal(
    new Date(body.socio.fechaVencimiento).getTime(),
    vencimientoEsperado.getTime(),
    'la vigencia debe reiniciarse desde la fecha de cobro (+7 días exactos)'
  );

  assert.equal(await prisma.pago.count(), 1);
  const enBD = await prisma.socio.findUnique({ where: { id: creado.body.id } });
  assert.equal(enBD.fechaVencimiento.getTime(), new Date(body.socio.fechaVencimiento).getTime());
});

test('POST /api/socios/:id/cobrar: un pase vencido también se reinicia desde la fecha de cobro', async () => {
  const creado = await api('POST', '/api/socios', {
    nombre: 'Vencida Ana',
    telefono: '555-8888',
    tipoPase: 'MENSUAL',
  });

  const vencida = new Date();
  vencida.setDate(vencida.getDate() - 40);
  await prisma.socio.update({ where: { id: creado.body.id }, data: { fechaVencimiento: vencida } });

  const { status, body } = await api('POST', `/api/socios/${creado.body.id}/cobrar`, {
    monto: 500,
    metodoPago: 'TRANSFERENCIA',
  });

  assert.equal(status, 201);
  const esperado = new Date();
  esperado.setHours(23, 59, 59, 999);
  esperado.setDate(esperado.getDate() + 30);
  assert.equal(
    new Date(body.socio.fechaVencimiento).getTime(),
    esperado.getTime(),
    'MENSUAL vencido debe volver a vencer hoy + 30 días'
  );
  assert.equal(body.socio.estatusColor, 'verde');
});

test('POST /api/socios/:id/cobrar: rechaza monto <= 0 con 400', async () => {
  const creado = await api('POST', '/api/socios', {
    nombre: 'Ana',
    telefono: '1',
    tipoPase: 'MENSUAL',
  });
  const { status } = await api('POST', `/api/socios/${creado.body.id}/cobrar`, {
    monto: 0,
    metodoPago: 'EFECTIVO',
  });
  assert.equal(status, 400);
  assert.equal(await prisma.pago.count(), 0);
});

test('POST /api/socios/:id/cobrar: rechaza método de pago inválido con 400', async () => {
  const creado = await api('POST', '/api/socios', {
    nombre: 'Ana',
    telefono: '1',
    tipoPase: 'MENSUAL',
  });
  const { status, body } = await api('POST', `/api/socios/${creado.body.id}/cobrar`, {
    monto: 100,
    metodoPago: 'TARJETA',
  });
  assert.equal(status, 400);
  assert.match(body.error, /metodoPago/i);
});

test('POST /api/socios/:id/cobrar: id no numérico responde 400', async () => {
  const { status } = await api('POST', '/api/socios/abc/cobrar', {
    monto: 100,
    metodoPago: 'EFECTIVO',
  });
  assert.equal(status, 400);
});

test('POST /api/socios/:id/cobrar: socio inexistente responde 404', async () => {
  const { status, body } = await api('POST', '/api/socios/9999/cobrar', {
    monto: 100,
    metodoPago: 'EFECTIVO',
  });
  assert.equal(status, 404);
  assert.match(body.error, /no encontrado/i);
});

test('ruta desconocida responde 404 en formato JSON', async () => {
  const { status, body } = await api('GET', '/api/inexistente');
  assert.equal(status, 404);
  assert.match(body.error, /no encontrada/i);
});
