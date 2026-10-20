const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-cambiar-en-produccion';

/**
 * POST /api/auth/login
 * Cuerpo esperado: { usuario: string, password: string }
 */
async function login(req, res) {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.status(400).json({
      error: 'Faltan credenciales',
      detalles: 'Se requieren los campos "usuario" y "password" en el body',
    });
  }

  const user = await prisma.usuario.findUnique({
    where: { usuario },
  });

  if (!user) {
    return res.status(401).json({
      error: 'No autorizado',
      detalles: 'Usuario no encontrado',
    });
  }

  const passwordValid = await bcrypt.compare(password, user.password);

  if (!passwordValid) {
    return res.status(401).json({
      error: 'No autorizado',
      detalles: 'Contraseña incorrecta',
    });
  }

  const token = jwt.sign(
    {
      id: user.id,
      usuario: user.usuario,
      rol: user.rol,
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.status(200).json({
    mensaje: 'Autenticación exitosa',
    token,
    usuario: {
      id: user.id,
      nombre: user.nombre,
      usuario: user.usuario,
      rol: user.rol,
    },
  });
}

module.exports = { login };
