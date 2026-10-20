process.env.DATABASE_URL = 'file:./test.db';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const bcrypt = require('bcryptjs');

const app = require('../src/app');
const prisma = require('../src/prismaClient');

let server;
let base;

async function api(metodo, ruta, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers,
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
  
  // Usuario aislado exclusivo para pruebas en test.db
  await prisma.usuario.deleteMany();
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.usuario.create({
    data: {
      nombre: 'Administrador Principal',
      username: 'admin',
      password: hashedPassword,
      rol: 'ADMIN',
    },
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test('POST /api/auth/login: rechaza campos faltantes con 400', async () => {
  const { status, body } = await api('POST', '/api/auth/login', {});
  assert.equal(status, 400);
  assert.match(body.error, /usuario y contraseña/i);
});

test('POST /api/auth/login: rechaza credenciales erróneas con 401', async () => {
  const { status, body } = await api('POST', '/api/auth/login', {
    username: 'admin',
    password: 'password_incorrecta',
  });
  assert.equal(status, 401);
  assert.match(body.error, /inválidas/i);
});

test('POST /api/auth/login: autentica exitosamente y entrega token y datos de usuario', async () => {
  const { status, body } = await api('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin123',
  });
  assert.equal(status, 200);
  assert.ok(body.token, 'Debe devolver un token JWT');
  assert.equal(body.usuario.username, 'admin');
  assert.equal(body.usuario.rol, 'ADMIN');
  assert.equal(body.usuario.password, undefined, 'No debe filtrar el password');
});

test('GET /api/auth/me: rechaza petición sin token con 401', async () => {
  const { status } = await api('GET', '/api/auth/me');
  assert.equal(status, 401);
});

test('GET /api/auth/me: valida token y responde información del usuario', async () => {
  const loginRes = await api('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin123',
  });
  const token = loginRes.body.token;

  const { status, body } = await api('GET', '/api/auth/me', undefined, token);
  assert.equal(status, 200);
  assert.equal(body.usuario.username, 'admin');
  assert.equal(body.usuario.rol, 'ADMIN');
});

test('POST /api/auth/recuperar-password: falla con 404 si el correo no existe', async () => {
  const { status, body } = await api('POST', '/api/auth/recuperar-password', {
    email: 'noexiste@powergym.com',
  });
  assert.equal(status, 404);
  assert.match(body.error, /no existe/i);
});

test('POST /api/auth/recuperar-password y POST /api/auth/reset-password: flujo completo de recuperación', async () => {
  const reqRes = await api('POST', '/api/auth/recuperar-password', {
    email: 'admin',
  });
  assert.equal(reqRes.status, 200);
  assert.ok(reqRes.body.resetToken, 'Debe retornar un resetToken');

  const resetRes = await api('POST', '/api/auth/reset-password', {
    token: reqRes.body.resetToken,
    nuevaPassword: 'NuevaPassword123*',
    confirmarPassword: 'NuevaPassword123*',
  });
  assert.equal(resetRes.status, 200);
  assert.match(resetRes.body.mensaje, /correctamente/i);

  // Iniciar sesión con la nueva contraseña
  const loginNueva = await api('POST', '/api/auth/login', {
    username: 'admin',
    password: 'NuevaPassword123*',
  });
  assert.equal(loginNueva.status, 200);
  assert.ok(loginNueva.body.token);
});
