# gym-backend — Inventario técnico completo

**Proyecto:** Gym Backend (API REST de recepción de gimnasio)
**Tipo:** Backend / API
**Stack:** Node.js 18+ · Express 5 · Prisma 6 · SQLite (archivo local) · bcryptjs · jsonwebtoken · swagger-ui-express
**Fecha de análisis:** 13/10/2026

---

## 1. Resumen ejecutivo

Backend monolítico (un solo repositorio) que expone una API REST para la **recepcionista** de un gimnasio. Gestiona **socios**, **pases/memberships** con vigencia automática y **cobros/renovaciones**. Incluye módulo de **autenticación** con JWT para **staff** (administradores y recepcionistas).

El frontend está en **repositorio separado** (no incluido aquí). Según `README.md`, habla con esta API en `http://localhost:3000/api` y se ejecuta en `http://localhost:8081/`.

---

## 2. Arquitectura y tecnologías

### 2.1 Stack

| Capa | Tecnología | Versión |
|---|---|---|
| Runtime | Node.js | 18+ |
| Framework | Express | 5.2.1 |
| ORM / DB | Prisma + SQLite | 6.19.3 |
| Hash de contraseñas | bcryptjs | 3.0.3 |
| Tokens | jsonwebtoken | 9.0.3 |
| Docs API | swagger-ui-express | 5.0.1 |
| CORS | cors | 2.8.6 |
| Variables de entorno | dotenv | 18.0.5 |
| Recarga en dev | nodemon | 3.1.14 |
| Package manager | npm (y pnpm en lock) | — |

### 2.2 Tipo de aplicación

- API REST sin estado.
- Servidor Express standalone (`src/index.js` → `src/app.js`).
- **Sin frontend dentro del repo**: el backend sirve solo JSON + Swagger UI.
- **Sin capa de persistencia distribuida**: SQLite en archivo local `prisma/dev.db`.

### 2.3 Estructura del código

```
/
├── src/
│   ├── index.js                  # Punto de entrada: dotenv + listen
│   ├── app.js                    # Express, middleware, rutas, 404/500
│   ├── prismaClient.js           #Instancia única de PrismaClient
│   ├── swagger.js                # Documento OpenAPI 3.0.3 completo
│   ├── controllers/
│   │   ├── authController.js     # Login staff (JWT)
│   │   └── socioController.js    # CRUD socios + cobros
│   └── routes/
│       ├── authRoutes.js         # POST /api/auth/login
│       └── socioRoutes.js        # GET/POST /api/socios, POST /api/socios/:id/cobrar
├── prisma/
│   ├── schema.prisma             # Modelo de datos + enums
│   ├── seed.js                   # Seed de usuario admin (bcrypt)
│   ├── dev.db                    # DB de desarrollo (no versionada)
│   ├── test.db                   # DB de tests (no versionada)
│   └── migrations/               # Migraciones históricas
├── test/
│   └── socios.test.js            # 21 tests automatizados de socios
├── package.json
├── .env.example
└── README.md
```

---

## 3. Estado actual de endpoints

| Método | Ruta | Descripción | Estado | Auth |
|---|---|---|---|---|
| GET | `/` | Bienvenida de la API | ✅ Implementado | No |
| GET | `/api-docs` | Swagger UI interactivo | ✅ Implementado | No |
| GET | `/api-docs.json` | Documento OpenAPI serializable | ✅ Implementado | No |
| GET | `/api/socios` | Listado de socios ordenado por vencimiento, con `estatusColor` y `diasRestantes` | ✅ Implementado | No |
| POST | `/api/socios` | Alta de socio (calcula fechaInicio y fechaVencimiento automáticamente) | ✅ Implementado | No |
| POST | `/api/socios/:id/cobrar` | Registra pago y **reinicia la vigencia desde la fecha de cobro** | ✅ Implementado | No |
| POST | `/api/auth/login` | Login de staff con JWT | ✅ Implementado | No (pero devuelve token) |
| **TODO** | `GET /api/pagos` | Histórico de caja | ❌ Pendiente | — |
| **TODO** | `DELETE /api/socios/:id` | Baja de socio | ❌ Pendiente | — |
| **TODO** | Middleware de JWT en rutas protetedas | Autenticación en rutas | ❌ Pendiente | — |

### 3.1 Observación importante sobre autenticación

El endpoint `/api/auth/login` **sí existe y funciona**, pero **ninguna ruta lo protege**. El token se genera, pero el backend no verifica JWT en ninguna petición. Las rutas de socios son públicas actualmente.

Además, el `authController.js` tiene un bug por el cambio del modelo:
- Usa `prisma.usuario.findUnique({ where: { username: usuario } })`
- Pero el modelo ahora es `usuario` (no `username`)
- **Esto romperá el login actualmente.**

---

## 4. Modelo de datos

### 4.1 Esquema completo (`prisma/schema.prisma`)

#### Enums

| Enum | Valores | Uso |
|---|---|---|
| `Rol` | `ADMINISTRADOR`, `RECEPCIONISTA` | Role del usuario/staff |
| `TipoPase` | `VISITA`, `SEMANAL`, `MENSUAL`, `ANUAL` | Tipo de membresía del socio |
| `MetodoPago` | `EFECTIVO`, `TRANSFERENCIA` | Método de cobro |

#### Modelos

##### `Usuario` → tabla `usuarios` (`@@map("usuarios")`)

| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | Int | PK autoincremental |
| `nombre` | String | NOT NULL |
| `usuario` | String | NOT NULL, UNIQUE |
| `password` | String | NOT NULL (contiene hash bcrypt) |
| `rol` | Rol | default: `RECEPCIONISTA` |
| `createdAt` | DateTime | default: now() |
| `updatedAt` | DateTime | @updatedAt automático |

##### `Socio` → tabla `Socio`

| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | Int | PK autoincremental |
| `nombre` | String | NOT NULL |
| `telefono` | String | NOT NULL, UNIQUE |
| `fechaInicio` | DateTime | default: now() |
| `fechaVencimiento` | DateTime | NOT NULL |
| `tipoPase` | TipoPase | NOT NULL |
| `createdAt` | DateTime | default: now() |
| `updatedAt` | DateTime | @updatedAt automático |
| `pagos` | Pago[] | Relación 1:N |

##### `Pago` → tabla `Pago`

| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | Int | PK autoincremental |
| `socioId` | Int | FK → Socio.id (ON DELETE RESTRICT) |
| `monto` | Float | NOT NULL |
| `metodoPago` | MetodoPago | NOT NULL |
| `fechaPago` | DateTime | default: now() |

### 4.2 Reglas de negocio en el modelo

- **Telefono único**: la BD tiene índice UNIQUE `Socio_telefono_key`. El controller lo detecta y devuelve 409.
- **NOT NULL en nombre y teléfono**: la BD lo valida también, no solo el controller.

---

## 5. Lógica de negocio clave

### 5.1 Cálculo de vigencia de pases

**Fuente única:** función `calcularFechaVencimiento(tipoPase, base)` en `socioController.js`.

**Regla:** fin de día de la fecha base + días exactos del pase.

| Tipo de pase | Días sumados |
|---|---|
| `VISITA` | +1 día |
| `SEMANAL` | +7 días |
| `MENSUAL` | +30 días (días naturales, no calenderizado) |
| `ANUAL` | +365 días |

**Detalles:**
- La fecha siempre se calcula **a las 23:59:59.999** del día base.
- El controller **ignora cualquier fecha proporcionada en el body** (automatización total).
- Esta misma fórmula se usa tanto en ** Alta** como en **Renovación por cobro**.

### 5.2 Estatus de vigencia (`conEstatus`)

Calculado en tiempo real al listar:

| Condición | `estatusColor` | `diasRestantes` |
|---|---|---|
| Vencido (`fechaVencimiento < ahora`) | `rojo` | `-1` (o días vencidos negativos) |
| Vigente, vence en ≤ 3 días | `amarillo` | días restantes (0-3) |
| Vigente, vence en > 3 días | `verde` | días restantes |

Orden del listado: **asc por fechaVencimiento** (próximos a vencer primero).

### 5.3 Cobro y renovación

Regla clave (requerimiento): **la vigencia se reinicia desde la fecha de cobro**:
- Nuevo vencimiento = hoy + días exactos del pase (misma fórmula de cálculo).
- **Los días restantes del periodo anterior NO se acumulan.**
- Se hace en **transacción** (`prisma.$transaction`): pago + actualización de socio.
- El socio puede estar vencido y se reinicia de igual manera.

### 5.4 Reglas de validación en API

#### Alta de socio (`POST /api/socios`)
- `nombre`: texto no vacío → 400
- `telefono`: texto no vacío → 400 (además UNIQUE en BD → 409)
- `tipoPase`: debe ser uno de los 4 valores → 400

#### Cobro (`POST /api/socios/:id/cobrar`)
- `id`: debe ser entero válido → 400
- `monto`: número > 0 → 400
- `metodoPago`: `EFECTIVO` o `TRANSFERENCIA` → 400
- Socio debe existir → 404

---

## 6. Autenticación y seguridad

### 6.1 Estado actual

| Aspecto | Estado |
|---|---|
| Hash de contraseñas | ✅ bcryptjs con salt 10 |
| Login con JWT | ✅ Implementado (`POST /api/auth/login`) |
| Almacenamiento seguro | ✅ Solo hash en BD |
| Verificación de JWT en rutas | ❌ No implementado |
| Seed de admin | ✅ `prisma/seed.js` (usuario: `admin`, password: `admin123`) |
| Secret de JWT | ⚠️ Hardcodeado en fallback: `dev-secret-cambiar-en-produccion` |

### 6.2 Flujo de login

1. `POST /api/auth/login` con `{ usuario, password }`
2. Busca en `usuarios` por `usuario`
3. Verifica contraseña con bcrypt
4. Si correcto → genera JWT con payload `{ id, usuario, rol }`, expiración 8h
5. Retorna `{ mensaje, token, usuario: { id, nombre, usuario, rol } }`

### 6.3 Vulnerabilidades conocidas

1. **Ninguna ruta protegida por JWT** → cualquiera puede usar la API.
2. **Bug en `authController.js`**: referencia `username` en vez de `usuario` → login roto.
3. `JWT_SECRET` tiene secret por defecto en código → riesgo en producción.
4. No hay rate limiting, ni limitación de intentos de login, ni bloqueo por fuerza bruta.

---

## 7. Documentación API (OpenAPI/Swagger)

El archivo `src/swagger.js` define el documento OpenAPI 3.0.3 completo con:
- 3 schemas principales: `Socio`, `Pago`, y los input/response types.
- 3 endpoints documentados: `GET/POST /api/socios`, `POST /api/socios/{id}/cobrar`.
- Ejemplos de respuestas y códigos de error (200, 201, 400, 404, 409).
- Swagger UI accesible en `/api-docs` y el JSON en `/api-docs.json`.

**Limitación:** el esquema de Swagger está desactualizado con respecto al modelo real:
- No documenta al modelo `Usuario`/`auth`.
- No incluye `createdAt`/`updatedAt` en `Socio` (agregados recientemente).

---

## 8. Scripts y comandos

### 8.1 Desarrollo

```bash
npm run dev      # nodemon src/index.js (recarga automática)
npm start        # node src/index.js
```

### 8.2 Base de datos

```bash
npm run prisma:generate          # prisma generate (regenera cliente)
npm run setup                    # prisma generate && prisma migrate deploy
npm run db:migrate               # prisma migrate dev --name init (nueva migración)
npm run db:seed                  # node prisma/seed.js (crea admin)
```

### 8.3 Tests

```bash
npm test   # node --test "test/*.test.js" → 21 tests contra prisma/test.db
```

Los tests:
- Usan BD separada `prisma/test.db` (nunca tocan `dev.db`).
- Corren contra el servidor Express real (no mocked).
- Cubren: creación, validaciones, duplicados, cobros, vigencia, estatus, 404.

---

## 9. Tests

### 9.1 Cobertura

**Archivo:** `test/socios.test.js`
**Total:** 21 tests (estimado por lectura del archivo).

Áreas cubiertas:
- ✅ Configuración de BD de tests (`test.db`, no `dev.db`)
- ✅ Swagger UI responde HTML
- ✅ Documento OpenAPI expone los 3 endpoints
- ✅ GET /api/socios lista vacía
- ✅ POST /api/socios crea socio con cálculo correcto
- ✅ POST /api/socios automatiza fechas por tipo de pase (+1/+7/+30/+365)
- ✅ POST /api/socios ignora fechas manuales
- ✅ POST /api/socios rechaza nombre vacío (400)
- ✅ POST /api/socios rechaza teléfono faltante (400)
- ✅ POST /api/socios rechaza tipoPase inválido (400)
- ✅ POST /api/socios rechaza teléfono duplicado (409)
- ✅ NOT NULL es enforceado por la BD (no solo API)
- ✅ Índice único de teléfono existe y es enforceado por BD
- ✅ GET /api/socios ordena por vencimiento ascendente
- ✅ POST /api/socios/:id/cobrar registra pago y reinicia vigencia desde cobro
- ✅ Pase vencido se reinicia igual desde fecha de cobro
- ✅ Cobro rechaza monto <= 0 (400)
- ✅ Cobro rechaza método inválido (400)
- ✅ Cobro rechaza id no numérico (400)
- ✅ Cobro rechaza socio inexistente (404)
- ✅ Ruta desconocida → 404 JSON

**No hay tests para:**
- ❌ `POST /api/auth/login`
- ❌ Flujo JWT
- ❌ AuthController (bug de `username` vs `usuario`)

---

## 10. Problemas y pendientes técnicos

### 🟡 Críticos (rompen funcionalidad)

1. **`authController.js` usa campo `username` en vez de `usuario`**
   - `where: { username: usuario }` → debe ser `where: { usuario }`
   - **El login actualmente no funciona con el esquema actual.**

### 🟠 Pendiente de implementar (requerimientos futuros)

1. **Protección de rutas con JWT**: middleware que verifique token en cabecera `Authorization: Bearer <token>`.
2. **Endpoints faltantes**:
   - `GET /api/pagos` (histórico de caja)
   - `DELETE /api/socios/:id` (baja de socio)
3. **Swagger actualizado**: incluir modelo `Usuario` y campos nuevos de `Socio`.
4. **Mejorar JWT_SECRET**: quitar secret por defecto o requerir variable de entorno.

### 🟢 Mejoras recomendadas

1. Rate limiting en login.
2. Validación de contraseña fuerte en registro de staff (si se agrega registro).
3. Registro de nuevo staff (endpoint POST /api/usuarios) — actualmente solo seed.
4. Logs estructurados en vez de `console.error`.
5. Estrategia de migraciones: `db push` funciona pero `prisma migrate` es más trazable.

---

## 11. Observaciones de codificación

- **Buenas prácticas observadas:**
  - Validación en controller + restricciones en BD (defensa en profundidad).
  - Cálculo centralizado en función única (`calcularFechaVencimiento`).
  - Transacciones en operaciones críticas (cobro).
  - Tests contra BD separada, sin efectos colaterales en dev.
  - `.env.example` documentado.
  - OpenAPI completo y consistente con los controladores.

- **Inconsistencias observadas:**
  - `authController` refiere `username` pero el modelo es `usuario`.
  - `Socio` tiene `createdAt`/`updatedAt` ahora pero Swagger no los documenta.
  - README menciona `VISITA +1` y `MENSUAL +30 días naturales` como "difiere de requerimientos.md" → pendiente de alinear con doc externa.

---

## 12. Pendientes conocidos (explicitados en README)

Del propio `README.md`:

> - No hay `GET /api/pagos` (histórico de caja), ni `DELETE /api/socios/:id`, ni autenticación.
> - `VISITA` vence +1 día y `MENSUAL` suma +30 días naturales (difiere de `requerimientos.md`, pendiente de alinear).

---

## 13. Flujo de datos externo

### Frontend (repositorio externo)

Según README, el frontend:
- Vive en otro repo (carpeta `frontend/` en otro proyecto).
- Se ejecuta en `http://localhost:8081/`.
- Habla con esta API en `http://localhost:3000/api` (valor fijo en `frontend/src/js/modules/api.js` según README).
- **No requiere `npm install`** según README (esto es inusual → confirmar si es injerto nativo o SPA pre-empaquetada).

**Nota:** Este repo no contiene el frontend. Si se necesita analizar, hay que clonar el otro repo.

---

## 14. Resumen de riesgos

| Riesgo | Severidad | Acción mínima |
|---|---|---|
| Login roto por campo `username` | 🔴 Crítico | Corregir `authController.js`: `username` → `usuario` |
| Rutas sin protección JWT | 🟠 Alto | Agregar middleware de verificación + aplicar a rutas |
| JWT_SECRET hardcodeado | 🟡 Medio | Requerir `JWT_SECRET` en `.env`, quitar default |
| Swagger desactualizado | 🟡 Medio | Actualizar `swagger.js` con nuevos campos |
| Tests sin cubrir auth | 🟡 Medio | Agregar tests para login y JWT |
| `db:push --accept-data-loss` en dev | 🟡 Medio | Considerar migraciones formales para trazabilidad |

---

*Documento generado por análisis automático del código. Fecha: 13/10/2026.*
