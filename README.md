# Exámenes Online — Sprint 1

Aplicación web de exámenes con dos roles (**PROFESOR** y **ALUMNO**). El profesor crea exámenes con consignas, elige herramientas (escritura, calculadora, GeoGebra), asigna alumnos y publica. El alumno resuelve el examen y lo envía una única vez. El profesor revisa las entregas.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · PostgreSQL · Prisma 6 · JWT (`jose`) · bcrypt (`bcryptjs`) · Zod · GeoGebra embebido · Vitest + Testing Library.

---

## 1. Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 20 o superior (probado con 24) |
| npm | 10 o superior |
| Base de datos | PostgreSQL administrado en [Neon](https://neon.tech) (no hace falta PostgreSQL ni Docker local) |

## 2. Database setup (Neon)

### 2.1 Crear el proyecto en Neon

1. Entrar a <https://console.neon.tech> y crear un proyecto (**New Project**), con Postgres 16+ y la región más cercana a donde vaya a correr la app (para Vercel: la misma región que las funciones, p. ej. `AWS US East 1`).
2. Neon crea la rama `production` (o `main`) con la base `neondb`. Esa rama es la de **producción**.
3. Recomendado: crear ramas separadas en **Branches → New branch** a partir de producción:
   - `dev`: la que usa tu `.env` local (podés romperla sin afectar producción).
   - `test`: la de los tests de integración (se vacía en cada corrida).

### 2.2 Obtener las connection strings

En el proyecto: **Dashboard → Connect** (botón arriba a la derecha). Elegir la rama, la base `neondb` y el rol, y copiar **dos** strings:

| Opción en Neon | Variable | Cómo se reconoce | Para qué |
|---|---|---|---|
| **Connection pooling: ON** | `DATABASE_URL` | el host contiene `-pooler` | la aplicación (runtime, local y Vercel) |
| **Connection pooling: OFF** | `DIRECT_URL` | mismo host **sin** `-pooler` | solo Prisma Migrate |

¿Por qué dos? La conexión pooled pasa por PgBouncer (modo transacción): soporta miles de conexiones simultáneas de funciones serverless, ideal para la app. Prisma Migrate necesita una sesión real de PostgreSQL (usa advisory locks), por eso las migraciones van por la directa (`directUrl` en `prisma/schema.prisma`). Prisma elige sola cuál usar: la app nunca toca `DIRECT_URL` y las migraciones nunca usan el pooler.

### 2.3 Crear `.env`

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Neon **pooled** (`-pooler`). Agregar `&connect_timeout=15` al final: Neon puede tardar unos segundos en despertar si la base estaba suspendida. |
| `DIRECT_URL` | Neon **directa** (sin `-pooler`), también con `&connect_timeout=15`. |
| `TEST_DATABASE_URL` / `TEST_DIRECT_URL` | Pooled y directa de **otra** rama/base (p. ej. `test`). Solo para `npm test`; la suite se niega a correr si apunta a la misma base que `DATABASE_URL`. |
| `JWT_SECRET` | Secreto de firma de los JWT, mínimo 32 caracteres: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

Las strings de Neon ya traen `sslmode=require`: la conexión va cifrada con TLS y no hace falta (ni se debe) desactivar la verificación de certificados. `.env` está en `.gitignore`: nunca se suben credenciales.

### 2.4 Instalar, migrar y ejecutar

```bash
npm install          # también ejecuta prisma generate (postinstall)
npm run db:deploy    # aplica prisma/migrations a Neon
npm run db:seed      # opcional: datos de demostración (¡vacía las tablas antes!)
npm run dev          # http://localhost:3000, conectado a Neon
```

Comprobar la conexión: <http://localhost:3000/api/health> responde `{"application":"ok","database":"ok"}` (o `503` si la base no responde).

### 2.5 Comandos de base de datos

| Comando | Entorno | Qué hace |
|---|---|---|
| `npm run db:migrate` | **solo desarrollo** | `prisma migrate dev`: crea una migración nueva tras cambiar `schema.prisma` y la aplica a tu rama `dev`. Interactivo; puede proponer resetear la base. Nunca usarlo contra producción. |
| `npm run db:deploy` | **producción** (y dev/test) | `prisma migrate deploy`: aplica solo las migraciones pendientes del repo. No es interactivo, no resetea ni genera migraciones. |
| `npm run db:status` | cualquiera | `prisma migrate status`: muestra migraciones aplicadas/pendientes. |
| `npm run db:generate` | cualquiera | regenera el cliente de Prisma. |
| `npm run db:seed` | **solo desarrollo** | datos de demo. Borra todas las tablas; está bloqueado si `NODE_ENV`/`VERCEL_ENV` es `production`. |

No usar `prisma db push` como reemplazo de las migraciones: el historial versionado está en `prisma/migrations/` y se sube a GitHub.

### 2.6 Migrar datos desde el PostgreSQL local (Docker) anterior

Solo si había datos reales en la base local que haya que conservar (si solo eran datos del seed, alcanza con `npm run db:seed`):

```bash
# 1) Neon con el schema: npm run db:deploy
# 2) Levantar el contenedor viejo y exportar SOLO los datos (sin la tabla de migraciones)
docker start examenes-postgres
docker exec examenes-postgres pg_dump -U examenes -d examenes --data-only --disable-triggers --exclude-table=_prisma_migrations -f /tmp/datos.sql
docker cp examenes-postgres:/tmp/datos.sql ./datos.sql
# 3) Importar en Neon usando la conexión DIRECTA (con un psql de Docker, no hace falta instalar nada)
docker run --rm -i postgres:16-alpine psql "<DIRECT_URL>" -v ON_ERROR_STOP=1 --single-transaction < datos.sql
# 4) Borrar datos.sql (contiene hashes de contraseñas y respuestas)
```

## 3. Deploy en Vercel

1. Subir el repo a GitHub (`.env` no se sube; `.env.example`, `prisma/schema.prisma`, `prisma/migrations/` y `package-lock.json` sí).
2. En Vercel: **Add New → Project** → importar el repo. Framework: Next.js. Si la app está en una subcarpeta del repo, configurar **Root Directory** = `examenes-app`.
3. **Project → Settings → Environment Variables**, para *Production* (y *Preview* si se usa):
   - `DATABASE_URL` → Neon pooled de la rama de **producción**
   - `DIRECT_URL` → Neon directa de la rama de **producción**
   - `JWT_SECRET` → un secreto nuevo, distinto al de desarrollo

   (Alternativa: la integración oficial Neon ↔ Vercel crea `DATABASE_URL` y `DATABASE_URL_UNPOOLED`; en ese caso definir `DIRECT_URL` con el valor de `DATABASE_URL_UNPOOLED`.)
4. Deploy. `npm install` genera el cliente de Prisma para Linux durante el build (`postinstall`); no hay archivos de configuración que cambiar entre local y producción.
5. **Migraciones en producción**: antes de desplegar código que incluya migraciones nuevas, aplicarlas a la rama de producción con el comando no interactivo:

   ```bash
   npx dotenv -e .env.production.local -- npm run db:deploy
   ```

   donde `.env.production.local` (ignorado por git) tiene `DATABASE_URL`/`DIRECT_URL` de producción. Para automatizarlo se puede definir en Vercel *Build Command* = `npm run db:deploy && npm run build` (solo aplica migraciones pendientes, nunca resetea); en ese caso conviene que los deploys *Preview* usen otra rama de Neon.

Flujo final: `git push` → GitHub → Vercel build → app conectada a Neon.

## 4. Iniciar el proyecto

```bash
npm run dev                 # desarrollo: http://localhost:3000
# o producción local:
npm run build && npm start
```

## 5. Usuarios de prueba

No existe registro público: los usuarios solo existen si están en la base (seed).

| Rol | Nombre | Email | Contraseña |
|---|---|---|---|
| Profesor | Laura Fernández | `profesor@test.com` | `Profesor123!` |
| Alumno | Juan Pérez | `alumno1@test.com` | `Alumno123!` |
| Alumno | María López | `alumno2@test.com` | `Alumno123!` |
| Alumno | Pedro García | `alumno3@test.com` | `Alumno123!` |

El seed crea además:

- **"Funciones lineales (borrador)"** — BORRADOR, asignado a los 3 alumnos (ninguno lo ve).
- **"Parcial 1 - Análisis Matemático"** — PUBLICADO, con las 3 herramientas, asignado a Juan y María. Pedro **no** lo tiene asignado (sirve para probar que no lo ve).
- **"TP 2 - Árboles de decisión"** — PUBLICADO, asignado a los 3 alumnos, con una consigna de cada tipo: Verdadero/Falso, Opción múltiple, Diagrama (pizarra) y Desarrollo.

## 6. Tests y calidad

```bash
npm test            # Vitest: integración (API + base real) y componentes
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run build       # build de producción
```

Los tests de integración necesitan `TEST_DATABASE_URL` (y `TEST_DIRECT_URL`) apuntando a una rama/base de Neon **distinta** de la de desarrollo: antes de la suite se aplican las migraciones a esa base y cada test la vacía y prepara sus propios datos.

| Archivo | Qué cubre |
|---|---|
| `tests/auth.test.ts` | Login profesor/alumno, contraseña incorrecta, usuario inexistente, bcrypt, logout, sin registro, 401/403, middleware |
| `tests/examenes.test.ts` | Crear examen, validaciones (título, enunciado, consignas, puntaje 0–10, herramientas), CHECK en la base, edición, publicación, propiedad, asignaciones |
| `tests/alumno.test.ts` | Alumno ve solo publicados + asignados, acceso por URL rechazado, herramientas |
| `tests/entregas.test.ts` | Envío, respuestas, fecha, GeoGebra, doble envío (409, también concurrente), no editar, validaciones de backend |
| `tests/profesor-entregas.test.ts` | Entregados / no entregados, abrir entrega, acceso de otro profesor (403) |
| `tests/calculator.test.ts` | Suma, resta, multiplicación, división, división por cero, precedencia, entradas inválidas |
| `tests/correccion.test.ts` | Tipos de consigna, respuesta correcta oculta al alumno, entrega por tipo, diagrama guardado exacto, corrección automática como sugerencia, corrección manual, nota total, CORREGIDO, permisos |
| `tests/components/*.test.tsx` | Herramientas visibles, cambio de consignas sin pérdida, localStorage, modal de confirmación, reintento ante fallos, formulario del profesor, calculadora, editor de diagramas, pantalla de corrección |

---

## 7. Corrección y preguntas prácticas (Sprint 2)

### Tipos de consigna

| Tipo | El alumno responde con | Corrección |
|---|---|---|
| `DESARROLLO` (por defecto) | Texto (si la escritura está habilitada) | Manual |
| `OPCION_MULTIPLE` | Una opción | Automática (sugerencia) + manual |
| `VERDADERO_FALSO` | Verdadero / Falso | Automática (sugerencia) + manual |
| `DIAGRAMA` | Pizarra de diagramación propia de la consigna | Manual, viendo el diagrama |

Las consignas existentes quedaron como `DESARROLLO`: no cambia nada para los exámenes anteriores. El profesor puede cargar un **criterio de corrección / respuesta esperada** en cualquier consigna. Ni el criterio ni la opción correcta se envían nunca al alumno.

### Editor de diagramas (`components/tools/DiagramEditor.tsx`)

Hecho en SVG propio, sin librerías. Tiene **círculos, rectángulos, texto y líneas**:

- **Figuras:** se mueven arrastrándolas y se redimensionan desde las esquinas. El texto se edita con doble clic o desde el campo "Texto".
- **Líneas:** se dibujan arrastrando de una figura a otra y quedan **ancladas**, así que siguen a las figuras. Los extremos se pueden mover y llevan etiqueta opcional ("Sí" / "No").
- **Edición:** Eliminar (botón o Supr), Deshacer/Rehacer (Ctrl+Z / Ctrl+Y) y flechas para mover la figura seleccionada.
- **Vista:** zoom con botones o Ctrl + rueda, desplazamiento arrastrando el fondo, "Ajustar" para ver todo el diagrama y "Ampliar" al corregir.
- **Modo lectura:** es el mismo componente con `readOnly`; lo usa el profesor al corregir.

Se guarda la **estructura completa** en `Respuesta.diagrama` (JSONB), no una imagen:

```json
{
  "version": 1,
  "shapes": [
    { "id": "shape-1", "type": "rectangle", "x": 200, "y": 50, "width": 120, "height": 60, "text": "Inicio" },
    { "id": "shape-2", "type": "circle", "x": 200, "y": 180, "width": 120, "height": 120, "text": "¿Edad >= 18?" }
  ],
  "connections": [
    { "id": "connection-1", "from": { "shapeId": "shape-1" }, "to": { "shapeId": "shape-2" }, "label": "" }
  ]
}
```

Un extremo de conexión puede ser `{ "shapeId" }` (anclado) o `{ "x", "y" }` (libre). La estructura se valida en el backend con Zod (`lib/diagrama.ts`). Mientras el alumno resuelve, el diagrama se guarda en el **mismo respaldo de localStorage** que las demás respuestas, así que un refresh no hace perder trabajo.

### Flujo de corrección

1. Al entregar, las consignas de opciones reciben una **sugerencia automática** (`puntajeSugerido`, `fuenteSugerencia = AUTOMATICA`, `sugerenciaDetalle`). La entrega queda `ENTREGADO` (= pendiente de corrección).
2. En **ENTREGAS** el profesor ve, por alumno, el estado de entrega, el estado de corrección y la nota. "Corregir" abre la entrega.
3. Para cada pregunta se muestran el enunciado, la respuesta, la correcta o el criterio, el máximo y la sugerencia. El profesor asigna o modifica el puntaje y deja feedback.
4. "Guardar corrección" deja la entrega `EN_CORRECCION`. "Marcar como corregido" la deja `CORREGIDO` y exige puntaje en todas las consignas. La **nota total** se calcula en el servidor como la suma de los puntajes asignados.
5. Todo queda guardado y se puede volver a abrir o editar.

**Preparado para IA:** cualquier corrector no humano escribe solo la *sugerencia*. El enum `FuenteSugerencia` ya incluye `IA` y la UI muestra "Sugerencia de IA" con el botón "Usar sugerencia". La nota final (`puntajeObtenido`) solo la escribe el profesor desde `PUT /api/profesor/entregas/:entregaId/correccion`.

## 8. Estructura del proyecto

```
app/
  login/                         Página de login
  profesor/                      Vistas del profesor (layout con requireRole)
    examenes/nuevo/              Crear examen
    examenes/[id]/               Detalle, publicar, asignaciones, ENTREGAS
    examenes/[id]/editar/        Editar borrador
    examenes/[id]/entregas/[entregaId]/   Ver una entrega
  alumno/                        Vistas del alumno
    examenes/[id]/               Resolver examen / ver entrega
  api/
    auth/{login,logout,me}
    profesor/{alumnos,examenes,examenes/[id],.../publicar,.../asignaciones,.../entregas,entregas/[entregaId]}
    alumno/{examenes,examenes/[id],examenes/[id]/entrega}
components/
  alumno/ResolverExamen.tsx      Resolución: consignas, escritura, envío con modal
  profesor/                      ExamenForm, PublicarButton, AsignacionesEditor
  tools/                         Calculadora, GeoGebraApplet
lib/
  prisma.ts  jwt.ts  auth.ts  session.ts  http.ts  calculator.ts
  services/{profesor,alumno}.ts  Lógica de negocio + autorización por recurso
  validations/{auth,examen,entrega}.ts   Esquemas Zod (frontend y backend)
middleware.ts                    Protección de rutas por JWT y rol
prisma/
  schema.prisma  migrations/  seed.ts
tests/
```

## 9. API

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | público | Login, setea cookie `session` (JWT httpOnly) |
| POST | `/api/auth/logout` | — | Borra la cookie |
| GET | `/api/auth/me` | autenticado | Usuario actual |
| GET | `/api/profesor/alumnos` | PROFESOR | Lista de alumnos |
| GET/POST | `/api/profesor/examenes` | PROFESOR | Mis exámenes / crear (BORRADOR) |
| GET/PUT | `/api/profesor/examenes/:id` | PROFESOR dueño | Detalle / editar borrador |
| POST | `/api/profesor/examenes/:id/publicar` | PROFESOR dueño | BORRADOR → PUBLICADO |
| PUT | `/api/profesor/examenes/:id/asignaciones` | PROFESOR dueño | Alumnos asignados |
| GET | `/api/profesor/examenes/:id/entregas` | PROFESOR dueño | Entregado / no entregado por alumno |
| GET | `/api/profesor/entregas/:entregaId` | PROFESOR dueño | Detalle de una entrega (con corrección) |
| PUT | `/api/profesor/entregas/:entregaId/correccion` | PROFESOR dueño | Guarda puntajes/feedback; `finalizar: true` la marca CORREGIDA |
| GET | `/api/alumno/examenes` | ALUMNO | Publicados y asignados |
| GET | `/api/alumno/examenes/:id` | ALUMNO asignado | Examen (+ entrega si existe) |
| POST | `/api/alumno/examenes/:id/entrega` | ALUMNO asignado | Envío definitivo (409 si ya entregó) |

Códigos usados: `400` datos inválidos · `401` no autenticado · `403` rol o recurso ajeno · `404` inexistente (o borrador para el alumno) · `409` conflicto (doble envío, ya publicado, editar publicado) · `500` error interno.

## 10. Seguridad

- Contraseñas con **bcrypt** (10 rondas). El login responde igual (y tarda lo mismo) para usuario inexistente o contraseña incorrecta.
- **JWT HS256** en cookie `httpOnly`, `SameSite=Lax` (y `Secure` en producción), vence a las 8 h.
- **Tres capas** de control:
  1. `middleware.ts`: JWT válido y rol según el prefijo (`/profesor`, `/alumno`, `/api/profesor`, `/api/alumno`).
  2. Cada Route Handler/página: vuelve a validar el JWT, **verifica que el usuario exista** y toma el **rol de la base**.
  3. Servicios: verifican la **propiedad del recurso** (examen del profesor, examen asignado y publicado para el alumno).
- La identidad (`profesorId`, `alumnoId`, rol) nunca se toma del body: sale del JWT.
- Reglas también en la base: `UNIQUE(email)`, `UNIQUE(examenId, alumnoId)` en asignaciones y entregas, `UNIQUE(examenId, orden)`, `CHECK (puntaje BETWEEN 0 AND 10)`.
- La calculadora usa un parser propio: **no hay `eval()`**.

## 11. Clases y exámenes por temas (Sprint 3)

### Modelo

```
PROFESOR → CLASE → ALUMNOS (InscripcionClase, UNIQUE alumnoId: un alumno = una clase)
EXAMEN → CLASE                         (asignación: sin filas por alumno)
ENTREGA: ALUMNO → EXAMEN [→ TEMA]      (individual, UNIQUE examenId + alumnoId)
```

- **Clase** (`nombre`, `descripcion`, `profesorId`). Para que un alumno pueda estar en varias clases alcanza con cambiar `UNIQUE(alumnoId)` por `UNIQUE(claseId, alumnoId)`.
- **Examen**: `claseId` (obligatoria para publicar), `modo` (`NORMAL` | `POR_TEMAS`), `fechaDisponible` y `duracionMinutos` (opcionales).
- **Tema** (`nombre`, `titulo`, `descripcion`, `orden`). `Consigna.temaId` y `Entrega.temaId` usan FK compuestas `(temaId, examenId)`: la base impide que un tema pertenezca a otro examen.
- **Entrega**: nuevo estado `EN_CURSO` (eligió tema o comenzó), `fechaInicio` y `temaId`. CHECK: `EN_CURSO ⇔ fechaEntrega IS NULL`.
- **Acceso del alumno**: exámenes publicados de su clase **actual** + los que ya entregó (historial, solo lectura). Un alumno agregado después de publicar ve el examen. Si cambia de clase, no ve los exámenes nuevos ni los pendientes de la anterior.
- `AsignacionExamen` queda como **legado**: ya no se usa para dar acceso, se conserva solo por los datos migrados.

### Migración `20261008112440_clases_y_temas`

No borra datos. Cada profesor con exámenes recibe una clase **"Sin asignar"**, a la que pasan sus exámenes y los alumnos que tenía asignados. Si hay un único profesor, los alumnos sin asignaciones también se inscriben ahí. Los alumnos que quedan sin clase aparecen en Alumnos → "Sin clase".

### Flujos

- **Profesor**: Clases → Crear clase → Agregar alumnos → Crear examen (normal o por temas) → Asignar a la clase (+ fecha, hora y duración) → Publicar → Entregas (filtros por tema, estado y alumno; estadísticas por tema) → Corregir.
- **Alumno, examen normal**: Entrar → Comenzar → Responder (autoguardado en el servidor) → Entregar.
- **Alumno, examen por temas**: Entrar → Elegir tema → Confirmar → Comenzar (el tema queda bloqueado) → Responder solo su tema → Entregar.
- **Duración**: al agotarse el tiempo el examen se entrega automáticamente. Si el navegador no lo envía, el servidor la cierra con lo último guardado (2 minutos de gracia).

### API nueva

| Método | Ruta | Uso |
|---|---|---|
| GET/POST | `/api/profesor/clases` | Listar / crear clases |
| GET/PATCH | `/api/profesor/clases/:id` | Detalle (alumnos y exámenes) / editar |
| POST | `/api/profesor/clases/:id/alumnos` | Agregar alumno (si está en otra clase propia, lo cambia de clase) |
| DELETE | `/api/profesor/clases/:id/alumnos/:alumnoId` | Quitar de la clase (no elimina al alumno) |
| PUT | `/api/profesor/examenes/:id/clase` | Asignar o cambiar la clase (solo si nadie comenzó) |
| GET | `/api/profesor/examenes/:id/temas` | Temas con sus consignas. Se crean, editan, eliminan y ordenan con `PUT /api/profesor/examenes/:id` |
| GET | `/api/alumno/clase` | Clase del alumno |
| PUT | `/api/alumno/examenes/:id/tema` | Elegir o cambiar tema (antes de comenzar) |
| POST | `/api/alumno/examenes/:id/iniciar` | Comenzar (bloquea el tema, arranca el tiempo) |
| PUT | `/api/alumno/examenes/:id/respuestas` | Guardar avance |

### Probar en el navegador sin tocar la base de desarrollo

```bash
# .env.e2e: DATABASE_URL y DIRECT_URL de una rama de Neon descartable (p. ej. "e2e")
npx dotenv -e .env.e2e -- npx prisma migrate deploy
npx dotenv -e .env.e2e -- npx tsx prisma/seed.ts
npm run dev:e2e   # http://localhost:3001
```

`.env.e2e` define `DATABASE_URL`, `DIRECT_URL` (rama de Neon para pruebas manuales) y `JWT_SECRET`. El seed crea: **Matemática 1A** (Juan, María y Ana), **Programación 2** (Pedro y Lucas, con el examen por temas "Trabajo Práctico Final") y a Sofía (`alumno6@test.com`) sin clase. También crea `profesor2@test.com`, que sirve para probar los permisos entre profesores. Los tests nuevos están en `tests/clases.test.ts`, `tests/temas.test.ts` y `tests/components/examen-form.test.tsx`.
