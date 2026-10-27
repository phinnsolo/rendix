# Rendix

Plataforma de gestión de exámenes/documentos. **Versión Semana 1**: login de profesor y CRUD básico de documentos.

## Demo en línea

La app está desplegada en Vercel: **https://rendix.vercel.app**

No hace falta instalar nada ni levantarla en localhost para probarla: basta con entrar al link e iniciar sesión con las credenciales de prueba de abajo.

Los datos se guardan en una base **PostgreSQL en [Neon](https://neon.tech)**, compartida entre dispositivos: el profesor y los alumnos pueden usar cada uno su computadora. La API corre como función de Vercel (`api/index.js` → `server/router.js`).

## Ejecutar localmente (opcional, para desarrollo)

Requiere Node 20+ y una base PostgreSQL (Neon, o una local, por ejemplo con `podman run -d -e POSTGRES_PASSWORD=rendix -e POSTGRES_DB=rendix -p 54329:5432 postgres:17-alpine`).

```bash
npm install
cp .env.example .env              # completar DATABASE_URL y AUTH_SECRET
node --env-file=.env scripts/seed.js   # crea las tablas y carga las cuentas y clases de prueba
npm run dev
```

Abrir http://localhost:5173. En desarrollo, Vite atiende `/api/*` con la misma API que corre en Vercel.

### Base de datos en Neon / Vercel

1. Crear el proyecto en Neon, o agregar la integración de Neon desde el dashboard de Vercel (crea `DATABASE_URL` sola).
2. En Vercel → Settings → Environment Variables, agregar `AUTH_SECRET` (un texto largo aleatorio, ej. `openssl rand -hex 32`).
3. Correr el seed una vez contra esa base: `DATABASE_URL=... node scripts/seed.js` (o con `vercel env pull .env` y `node --env-file=.env scripts/seed.js`). Se puede volver a correr: no pisa datos.

## Credenciales de prueba

| Usuario | Contraseña | Nombre | Rol |
|---|---|---|---|
| `profesor1` | `rendix123` | Profesor Demo 1 | profesor |
| `profesor2` | `rendix123` | Profesor Demo 2 | profesor |
| `profesor3` | `rendix123` | Profesor Demo 3 | profesor |
| `alumno1` … `alumno10` | `rendix123` | Alumno Demo 1 … 10 | alumno |
| `dev1` | `rendix123` | Dev Demo | dev |

Las carga `scripts/seed.js` (definidas en `scripts/seed-data.js`); las contraseñas se guardan hasheadas.

Un alumno también puede **crear su cuenta** desde el login ("Crear cuenta"), con nombre, usuario, mail y contraseña (mínimo 6 caracteres). Después entra con el usuario o con el mail. No se puede repetir un usuario ni un mail que ya tenga otra cuenta. El profesor las encuentra por nombre, usuario o mail al asignar alumnos a un turno.

## Alcance actual

- Login de dev, profesor y alumno (sin recuperación de contraseña). Cada rol solo puede entrar a sus pantallas.
- Clases: el **dev** ve todas las clases en cuadritos y crea nuevas con nombre, día de la semana, turno, profesores y alumnos. Cada clase se dicta siempre el mismo día y en el mismo turno. Al entrar, el **profesor** y el **alumno** ven en cuadritos las clases que tienen asignadas (el alumno tiene sus parciales en la sección **Parciales**). Hay dos clases predefinidas en `src/config.js` (las carga el seed): **Matemáticas** (lunes, turno mañana; profesor1; alumno1 a alumno5) y **Física** (miércoles, turno tarde; profesor2; alumno4 a alumno8). Por ahora los parciales todavía no están conectados a las clases.
- Parciales del profesor: crear, listar, ver, editar y eliminar, separados en las pestañas **Creados** y **Publicados**. Desde Creados se puede **publicar** un parcial.
- Duración: al crear un parcial el profesor elige cuántos minutos dura (máximo 120). Los parciales anteriores quedan sin límite de tiempo.
- Turnos: hay tres turnos fijos, definidos en `src/config.js`: mañana (07:45 a 11:45), tarde (13:30 a 17:30) y noche (18:30 a 22:30). Al crear o editar un parcial el profesor le asigna uno o más turnos, con la fecha y la hora de inicio. El fin es la hora de inicio más la duración. La hora de inicio se habilita recién cuando hay duración y turno, y no se acepta si el parcial terminaría después del fin del turno (ej. 120 min en el turno mañana tiene que empezar entre 07:45 y 09:45) ni si ya pasó. Un turno se puede cambiar o quitar solo antes de que empiece, y la duración queda fija cuando alguno ya empezó.
- Alumnos y seguimiento: desde el detalle del parcial, en cada turno asignado el profesor busca alumnos por nombre, los asigna y ve quién **no abrió**, quién lo está rindiendo, quién **entregó** y, al terminar, quién **no completó**.
- **Monitoreo** (pestaña del profesor): un panel por cada parcial que se está tomando ahora, actualizado cada 2 s. Arriba, el tiempo restante del turno y cuántos alumnos tienen **cambios pendientes** de sincronizar. Abajo, cada alumno con su estado (**en línea**, **desconectado**, **entregado**, **entregado por sistema**, **no abrió**), una barra con el tiempo usado, su tiempo restante y la hora del último dato recibido. Los desconectados aparecen primero.
- La sección **Turnos** muestra los parciales publicados en las pestañas **Próximos**, **En curso** y **Finalizados**.
- Vista del alumno: lista de los parciales de los turnos a los que fue asignado, con la fecha y el horario. Solo puede abrir el parcial dentro del horario del turno. El alumno abre un parcial, toca **Comenzar parcial**, lo responde y lo **envía una sola vez**. Después solo puede ver su entrega.
- Examen seguro y persistente:
  - **Temporizador** en `HH:MM:SS` calculado con la hora del servidor y la hora límite que el servidor fija al comenzar (la duración o el fin del turno, lo que llegue antes). Cambiar la hora del dispositivo no lo afecta. Avisos a los 10, 5 y 1 minuto.
  - **Autoguardado**: cada cambio (texto, código, multiple choice, GeoGebra) se guarda en la base a los 300 ms de la última interacción, con el indicador "Guardando…", "Guardado" o "Sin conexión (guardado en caché local)". Sin red, las respuestas quedan en el navegador y se suben solas al volver la conexión.
  - **Reingreso**: al recargar, cerrar el navegador o entrar desde otro dispositivo, se retoma con las respuestas guardadas y el tiempo real que queda.
  - **Entrega automática**: en 00:00:00 se bloquea la edición y se envía lo respondido. Si el alumno está desconectado, el servidor entrega lo último guardado al pasar la hora límite (se ve como "Enviado por vencimiento").
  - Las fechas y horas de los turnos se interpretan en hora argentina (`ZONA_HORARIA` en `src/config.js`).
- El profesor puede publicar un parcial desde la lista (pestaña Creados) o desde el detalle, siempre que tenga algún turno que todavía no empezó.
- Herramientas: mientras resuelve, el alumno abre desde pestañas a la izquierda las herramientas que habilitó el profesor (calculadora científica y GeoGebra), en una ventanita flotante.
- Entregas: en el detalle de cada parcial publicado y en la sección **Entregas** (pestañas Sin corregir / Corregidas) el profesor ve las respuestas del alumno, cuándo empezó, cuándo entregó y si se envió por tiempo, y la corrige con una nota (0 a 10) y una devolución.
- El alumno tiene sus parciales separados en **A entregar** y **Entregados**; al abrir un parcial entregado ve la nota y la devolución del profesor.
- La sesión es **por pestaña**: se puede tener al profesor en una pestaña y a un alumno en otra. Al abrir una pestaña nueva hay que volver a iniciar sesión.

## Build / deploy

```bash
npm run build     # genera dist/
npm run preview   # sirve el build localmente
```

Desplegado en Vercel (preset Vite) en https://rendix.vercel.app. `vercel.json` manda `/api/*` a la función de la API y el resto de las rutas a `index.html`, para que funcione recargar en cualquier URL. Necesita las variables `DATABASE_URL` y `AUTH_SECRET`.
