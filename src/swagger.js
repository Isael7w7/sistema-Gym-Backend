const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Gym Backend - API de Socios',
    version: '1.0.0',
    description:
      'API para gestionar socios del gimnasio: alta, listado con estatus de vencimiento y cobro/renovación de membresías.',
  },
  servers: [{ url: '/', description: 'Servidor actual' }],
  tags: [{ name: 'Socios', description: 'Alta, listado y cobro de socios' }],
  components: {
    schemas: {
      Socio: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          nombre: { type: 'string', example: 'Ana Perez' },
          telefono: {
            type: 'string',
            example: '555-1234',
            description: 'Obligatorio (NOT NULL) y único: no se permiten teléfonos duplicados.',
          },
          fechaInicio: { type: 'string', format: 'date-time', example: '2026-10-06T17:00:00.000Z' },
          fechaVencimiento: { type: 'string', format: 'date-time', example: '2026-11-06T23:59:59.999Z' },
          tipoPase: { type: 'string', enum: ['VISITA', 'SEMANAL', 'MENSUAL', 'ANUAL'] },
          estatusColor: {
            type: 'string',
            enum: ['verde', 'amarillo', 'rojo'],
            description: 'verde: vigente; amarillo: vence en 3 días o menos; rojo: vencido',
          },
          diasRestantes: {
            type: 'integer',
            example: 30,
            description: 'Días restantes de vigencia; -1 si el pase ya venció',
          },
        },
      },
      Pago: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          socioId: { type: 'integer', example: 1 },
          monto: { type: 'number', example: 500 },
          metodoPago: { type: 'string', enum: ['EFECTIVO', 'TRANSFERENCIA'] },
          fechaPago: { type: 'string', format: 'date-time' },
        },
      },
      SocioInput: {
        type: 'object',
        required: ['nombre', 'telefono', 'tipoPase'],
        properties: {
          nombre: { type: 'string', example: 'Ana Perez' },
          telefono: {
            type: 'string',
            example: '555-1234',
            description: 'Obligatorio (NOT NULL) y único: repetir un teléfono devuelve 409.',
          },
          tipoPase: { type: 'string', enum: ['VISITA', 'SEMANAL', 'MENSUAL', 'ANUAL'] },
        },
      },
      CobroInput: {
        type: 'object',
        required: ['monto', 'metodoPago'],
        properties: {
          monto: { type: 'number', exclusiveMinimum: 0, example: 500 },
          metodoPago: { type: 'string', enum: ['EFECTIVO', 'TRANSFERENCIA'] },
        },
      },
      CobroResponse: {
        type: 'object',
        properties: {
          mensaje: { type: 'string', example: 'Cobro registrado y membresia renovada' },
          socio: { $ref: '#/components/schemas/Socio' },
          pago: { $ref: '#/components/schemas/Pago' },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string', example: 'El campo nombre es obligatorio' } },
      },
    },
  },
  paths: {
    '/api/socios': {
      get: {
        tags: ['Socios'],
        summary: 'Listar socios',
        description: 'Devuelve todos los socios ordenados por fecha de vencimiento (más próxima primero).',
        responses: {
          200: {
            description: 'Listado de socios',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Socio' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Socios'],
        summary: 'Crear un socio',
        description:
          'Da de alta un socio. La fecha de vencimiento se calcula automáticamente sumando los días exactos del pase: VISITA +1, SEMANAL +7, MENSUAL +30, ANUAL +365, siempre a fin de día. No se acepta una fecha manual en el body.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/SocioInput' } },
          },
        },
        responses: {
          201: {
            description: 'Socio creado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Socio' } },
            },
          },
          400: {
            description: 'Datos inválidos',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          409: {
            description: 'Teléfono duplicado: ya existe un socio con ese número',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/socios/{id}/cobrar': {
      post: {
        tags: ['Socios'],
        summary: 'Cobrar y renovar la membresía de un socio',
        description:
          'Registra un pago y renueva la membresía sumando automáticamente los días exactos del pase (+1, +7, +30 o +365) sobre la fecha de vencimiento actual; si el pase ya venció, la suma parte desde hoy.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'ID del socio',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CobroInput' } },
          },
        },
        responses: {
          201: {
            description: 'Cobro registrado y membresía renovada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CobroResponse' } },
            },
          },
          400: {
            description: 'Datos inválidos',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          404: {
            description: 'Socio no encontrado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
  },
};

module.exports = openapiSpec;
