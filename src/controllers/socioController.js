const prisma = require('../prismaClient');

const MS_POR_DIA = 1000 * 60 * 60 * 24;

// Días exactos que se suman automáticamente por tipo de pase.
// El recepcionista nunca calcula la fecha a mano: siempre la deriva el sistema.
const DIAS_POR_TIPO_PASE = {
  VISITA: 1,
  SEMANAL: 7,
  MENSUAL: 30,
  ANUAL: 365,
};

const TIPOS_PASE = Object.keys(DIAS_POR_TIPO_PASE);
const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA'];

function finDelDia(fecha) {
  const fechaLimite = new Date(fecha);
  fechaLimite.setHours(23, 59, 59, 999);
  return fechaLimite;
}

function sumarDias(fecha, dias) {
  const nuevaFecha = new Date(fecha);
  nuevaFecha.setDate(nuevaFecha.getDate() + dias);
  return nuevaFecha;
}

// Fuente única del cálculo: fin de día de la fecha base + días exactos del pase.
// Se usa tanto en el alta como en la renovación por cobro.
function calcularFechaVencimiento(tipoPase, base = new Date()) {
  return sumarDias(finDelDia(base), DIAS_POR_TIPO_PASE[tipoPase]);
}

function calcularEstatus(fechaVencimiento) {
  const ahora = new Date();
  const diferenciaMs = new Date(fechaVencimiento).getTime() - ahora.getTime();

  let diasRestantes;
  if (diferenciaMs >= 0) {
    diasRestantes = Math.floor(diferenciaMs / MS_POR_DIA);
  } else {
    const diasVencidos = Math.ceil(diferenciaMs / MS_POR_DIA);
    diasRestantes = diasVencidos < 0 ? diasVencidos : -1;
  }

  let estatusColor;
  if (diferenciaMs < 0) {
    estatusColor = 'rojo';
  } else if (diasRestantes <= 3) {
    estatusColor = 'amarillo';
  } else {
    estatusColor = 'verde';
  }

  return { diasRestantes, estatusColor };
}

function conEstatus(socio) {
  const { diasRestantes, estatusColor } = calcularEstatus(socio.fechaVencimiento);
  return { ...socio, estatusColor, diasRestantes };
}

function esTextoNoVacio(valor) {
  return typeof valor === 'string' && valor.trim().length > 0;
}

// El índice único de Socio.telefono es la garantía final contra duplicados
// (incluso con peticiones simultáneas); aquí solo lo traducimos a un 409 claro.
function esTelefonoDuplicado(error) {
  if (error?.code !== 'P2002') return false;
  const target = error.meta?.target;
  const campos = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return campos === '' || campos.includes('telefono');
}

async function listarSocios(req, res, next) {
  try {
    const socios = await prisma.socio.findMany({
      orderBy: { fechaVencimiento: 'asc' },
    });
    res.json(socios.map(conEstatus));
  } catch (error) {
    next(error);
  }
}

async function crearSocio(req, res, next) {
  try {
    const { nombre, telefono, tipoPase } = req.body;

    if (!esTextoNoVacio(nombre)) {
      return res.status(400).json({ error: 'El campo nombre es obligatorio' });
    }

    if (!esTextoNoVacio(telefono)) {
      return res.status(400).json({ error: 'El campo telefono es obligatorio' });
    }

    if (!TIPOS_PASE.includes(tipoPase)) {
      return res.status(400).json({
        error: `El campo tipoPase es obligatorio. Valores permitidos: ${TIPOS_PASE.join(', ')}`,
      });
    }

    // Fechas generadas por el sistema: cualquier fechaVencimiento/fechaInicio
    // que llegue en el body se ignora (automatización, no cálculo manual).
    let socio;
    try {
      socio = await prisma.socio.create({
        data: {
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          tipoPase,
          fechaInicio: new Date(),
          fechaVencimiento: calcularFechaVencimiento(tipoPase),
        },
      });
    } catch (error) {
      if (esTelefonoDuplicado(error)) {
        return res.status(409).json({
          error: `Ya existe un socio con el telefono ${telefono.trim()}`,
        });
      }
      throw error;
    }

    res.status(201).json(conEstatus(socio));
  } catch (error) {
    next(error);
  }
}

async function cobrarSocio(req, res, next) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'El id del socio debe ser un numero valido' });
    }

    const { monto, metodoPago } = req.body;

    if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ error: 'El campo monto es obligatorio y debe ser mayor a 0' });
    }

    if (!METODOS_PAGO.includes(metodoPago)) {
      return res.status(400).json({
        error: `El campo metodoPago es obligatorio. Valores permitidos: ${METODOS_PAGO.join(', ')}`,
      });
    }

    const socio = await prisma.socio.findUnique({ where: { id } });

    if (!socio) {
      return res.status(404).json({ error: 'Socio no encontrado' });
    }

    // Requerimiento (Bloque 1, pregunta 1): la vigencia se reinicia desde la fecha de cobro.
    // Los días que le sobraban al socio NO se acumulan al nuevo periodo.
    const fechaVencimientoRenovada = calcularFechaVencimiento(socio.tipoPase, new Date());

    const [pago, socioActualizado] = await prisma.$transaction([
      prisma.pago.create({
        data: { socioId: id, monto, metodoPago },
      }),
      prisma.socio.update({
        where: { id },
        data: { fechaVencimiento: fechaVencimientoRenovada },
      }),
    ]);

    res.status(201).json({
      mensaje: 'Cobro registrado y membresia renovada',
      socio: conEstatus(socioActualizado),
      pago,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listarSocios,
  crearSocio,
  cobrarSocio,
};
