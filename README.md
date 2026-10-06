# gym-backend

API REST para la recepción de un gimnasio: socios, vigencias y cobros.
Express 5 + Prisma + SQLite (archivo local, sin servidor de base de datos).

## Requisitos

- Node.js 18 o superior (`node -v`)
- npm (viene con Node)

## Puesta en marcha (desde un clon limpio)

```bash
git clone <URL_DEL_REPO>
cd gym-backend

# 1) Archivo de entorno (la BD y el puerto)
cp .env.example .env
# Windows:  copy .env.example .env

# 2) Dependencias (también genera el cliente de Prisma)
npm install

# 3) Base de datos: crea prisma/dev.db a partir de prisma/migrations
npm run setup

# 4) Arrancar
npm start
```

- API: http://localhost:3000/api/socios
- Documentación Swagger: http://localhost:3000/api-docs

> Si vas a trabajar con recarga automática: `npm run dev` (nodemon).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Arranca el servidor (`node src/index.js`) |
| `npm run dev` | Arranca con recarga automática (nodemon) |
| `npm run setup` | `prisma generate` + `prisma migrate deploy` (crea/actualiza la BD) |
| `npm run prisma:generate` | Regenera el cliente de Prisma |
| `npm run db:migrate` | Crea una migración nueva (solo desarrollo) |
| `npm test` | 21 tests contra `prisma/test.db` (nunca toca `dev.db`) |

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/socios` | Lista de socios ordenada por vencimiento, con `estatusColor` y `diasRestantes` |
| POST | `/api/socios` | Alta de socio. La vigencia la calcula el servidor: fin de día + 1/7/30/365 días. Teléfono repetido → `409` |
| POST | `/api/socios/:id/cobrar` | Registra un pago y **reinicia la vigencia desde la fecha de cobro** (hoy + días del pase) |
| GET | `/api-docs` | Swagger UI |

### Ejemplos

```bash
# Listar
curl http://localhost:3000/api/socios

# Alta (tipoPase: VISITA | SEMANAL | MENSUAL | ANUAL)
curl -X POST http://localhost:3000/api/socios \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Ana Pérez","telefono":"5512345678","tipoPase":"MENSUAL"}'

# Cobrar (metodoPago: EFECTIVO | TRANSFERENCIA)
curl -X POST http://localhost:3000/api/socios/1/cobrar \
  -H 'Content-Type: application/json' \
  -d '{"monto":500,"metodoPago":"EFECTIVO"}'
```

## Base de datos

- `prisma/dev.db` → datos reales. **No está en git**: se crea sola con `npm run setup`.
- `prisma/test.db` → solo la usan los tests.
- Migraciones versionadas en `prisma/migrations/`.
- Si quieres empezar de cero: borra `prisma/dev.db` y vuelve a correr `npm run setup`.

## Frontend

El front vive en el otro repositorio (carpeta `frontend/`):

```bash
git clone <URL_DEL_REPO_FRONT>
cd <repo-front>
npm run dev            # no necesita npm install
```

Abre http://localhost:8081/ → habla con esta API en `http://localhost:3000/api` (ambos en la misma máquina, sin cambios de configuración).

## Solución de problemas

- **`EPERM ... query_engine-windows.dll.node` al correr `npm run setup`**: el servidor está corriendo y bloquea el binario de Prisma. Detén el servidor, vuelve a correr `npm run setup` y arranca de nuevo.
- **`Error: Invalid input` o que la BD esté vacía**: falta `prisma/dev.db`; corre `npm run setup`.
- **`EADDRINUSE` / ya hay otro proceso en el puerto**: cambia `PORT` en `.env`.
- **`ECONNREFUSED` desde el front**: verifica que el backend esté en `http://localhost:3000/api` (valor fijo en `frontend/src/js/modules/api.js`).

## Estructura

```
src/
  index.js              # arranca el servidor (dotenv + listen)
  app.js                # express, cors, swagger y rutas
  routes/socioRoutes.js
  controllers/socioController.js
  prismaClient.js
  swagger.js            # documento OpenAPI
prisma/
  schema.prisma         # modelos Socio, Pago, Usuario y enums
  migrations/
test/socios.test.js
```

## Pendientes conocidos

- No hay `GET /api/pagos` (histórico de caja), ni `DELETE /api/socios/:id`, ni autenticación.
- `VISITA` vence +1 día y `MENSUAL` suma +30 días naturales (difiere de `requerimientos.md`, pendiente de alinear).
