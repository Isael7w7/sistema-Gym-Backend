const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');

const JWT_SECRET = process.env.JWT_SECRET || 'gym_jwt_secret_super_seguro_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';



/**
 * POST /api/auth/login
 * Body: { username, password }
 */
async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        error: 'Debe ingresar nombre de usuario y contraseña',
      });
    }

    const searchUsername = String(username).trim();
    let usuario = await prisma.usuario.findUnique({
      where: { username: searchUsername },
    });

    if (!usuario) {
      const usuarios = await prisma.usuario.findMany();
      const searchLower = searchUsername.toLowerCase();
      usuario = usuarios.find(u => {
        const uLower = u.username.toLowerCase();
        const prefixLower = uLower.split('@')[0];
        const nombreLower = (u.nombre || '').toLowerCase();
        return uLower === searchLower || prefixLower === searchLower || nombreLower === searchLower;
      }) || null;
    }

    if (!usuario) {
      return res.status(401).json({
        error: 'Credenciales inválidas (usuario o contraseña incorrectos)',
      });
    }

    // Soporte para contraseñas con hash bcrypt o texto plano (para migración automática)
    let passwordValido = false;
    const rawPass = String(password);
    const trimmedPass = rawPass.trim();

    if (usuario.password.startsWith('$2a$') || usuario.password.startsWith('$2b$')) {
      passwordValido = await bcrypt.compare(rawPass, usuario.password);
      if (!passwordValido && rawPass !== trimmedPass) {
        passwordValido = await bcrypt.compare(trimmedPass, usuario.password);
      }
    } else {
      passwordValido = (rawPass === usuario.password || trimmedPass === usuario.password);
      if (passwordValido) {
        // Actualizar a hash seguro en segundo plano
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(trimmedPass, salt);
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { password: hashedPassword },
        }).catch(err => console.error('Error actualizando hash:', err));
      }
    }

    if (!passwordValido) {
      return res.status(401).json({
        error: 'Credenciales inválidas (usuario o contraseña incorrectos)',
      });
    }

    const payload = {
      id: usuario.id,
      username: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return res.status(200).json({
      mensaje: 'Inicio de sesión exitoso',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        username: usuario.username,
        rol: usuario.rol,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/register
 * Body: { nombre, username, password, rol }
 */
async function register(req, res, next) {
  try {
    const { nombre, username, password, rol } = req.body || {};

    if (!nombre || !username || !password) {
      return res.status(400).json({
        error: 'El nombre, username (o correo) y la contraseña son obligatorios',
      });
    }

    const usernameNormalizado = String(username).trim();

    const usuarios = await prisma.usuario.findMany({ select: { username: true } });
    const usuarioExistente = usuarios.some(
      u => u.username.toLowerCase() === usernameNormalizado.toLowerCase()
    );

    if (usuarioExistente) {
      return res.status(409).json({
        error: 'El nombre de usuario o correo ya está registrado',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const rolValido = (rol === 'ADMIN' || rol === 'RECEPCIONISTA') ? rol : 'RECEPCIONISTA';

    const nuevoUsuario = await prisma.usuario.create({
      data: {
        nombre: String(nombre).trim(),
        username: usernameNormalizado,
        password: hashedPassword,
        rol: rolValido,
      },
    });

    return res.status(201).json({
      mensaje: 'Usuario registrado con éxito',
      usuario: {
        id: nuevoUsuario.id,
        nombre: nuevoUsuario.nombre,
        username: nuevoUsuario.username,
        rol: nuevoUsuario.rol,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me
 * Retorna la información del usuario autenticado actual a partir del token.
 */
async function me(req, res) {
  return res.json({
    usuario: req.usuario,
  });
}

/**
 * POST /api/auth/recuperar-password
 * Body: { email }
 */
async function recuperarPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    if (!email || !String(email).trim()) {
      return res.status(400).json({
        error: 'Debe ingresar su correo electrónico o identificador de usuario',
      });
    }

    const emailBuscado = String(email).trim().toLowerCase();
    const usuarios = await prisma.usuario.findMany();
    const usuario = usuarios.find(
      (u) => u.username.toLowerCase() === emailBuscado
    );

    if (!usuario) {
      return res.status(404).json({
        error: 'No existe ninguna cuenta registrada con este correo electrónico',
      });
    }

    // Token de recuperación con validez temporal de 30 minutos
    const resetToken = jwt.sign(
      {
        id: usuario.id,
        username: usuario.username,
        type: 'password_reset',
      },
      JWT_SECRET,
      { expiresIn: '30m' }
    );

    return res.status(200).json({
      mensaje: 'Enlace de recuperación generado con éxito',
      resetToken,
      email: usuario.username,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/reset-password
 * Body: { token, nuevaPassword, confirmarPassword }
 */
async function resetPassword(req, res, next) {
  try {
    const { token, nuevaPassword, confirmarPassword } = req.body || {};

    if (!token) {
      return res.status(400).json({
        error: 'El token de recuperación es requerido',
      });
    }

    if (!nuevaPassword || !confirmarPassword) {
      return res.status(400).json({
        error: 'Debe ingresar y confirmar la nueva contraseña',
      });
    }

    if (nuevaPassword !== confirmarPassword) {
      return res.status(400).json({
        error: 'Las contraseñas no coinciden',
      });
    }

    if (String(nuevaPassword).length < 6) {
      return res.status(400).json({
        error: 'La nueva contraseña debe tener al menos 6 caracteres',
      });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{6,}$/;
    if (!passwordRegex.test(String(nuevaPassword))) {
      return res.status(400).json({
        error: 'La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(400).json({
        error: 'El enlace o token de recuperación es inválido o ha expirado',
      });
    }

    if (decoded.type !== 'password_reset') {
      return res.status(400).json({
        error: 'Tipo de token inválido para restablecimiento de contraseña',
      });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id },
    });

    if (!usuario) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(nuevaPassword, salt);

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { password: hashedPassword },
    });

    return res.status(200).json({
      mensaje: 'Tu contraseña se cambió correctamente. Ya puedes iniciar sesión en POWERGYM con tu nueva contraseña.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  register,
  me,
  recuperarPassword,
  resetPassword,
};

