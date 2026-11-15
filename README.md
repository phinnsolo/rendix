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
4. **Migraciones**: en una base que ya existe, aplicar las pendientes de `db/migrations` con `npm run db:migrate` (usa `.env`) o `DATABASE_URL=... node scripts/migrate.js`. Solo agregan columnas, estados, tablas e índices; no borran datos y quedan anotadas en la tabla `migraciones`. El seed también las aplica.

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
- **Monitoreo** (pestaña del profesor): un panel por cada parcial que se está tomando ahora (o que terminó pero tiene un Incidente pendiente), actualizado cada 2 s sin superponer pedidos. Arriba, el tiempo restante del turno, la cantidad de **incidentes** y de alumnos con **cambios pendientes** de sincronizar. Abajo, cada alumno con su **nombre**, **estado** (**En curso**, **Entregado**, **Salió y se entregó**, **Incidente**, o **No abrió**), la **última actividad** y las **acciones** (**Reanudar** solo en Incidente, y **Ver actividad**). Los incidentes aparecen primero. Al hacer click en un alumno se abre un panel lateral con inicio, entrega, tipo de salida, reanudaciones (quién y cuándo) y la línea de tiempo de eventos.
- **Modo restringido** (Sprint 4):
  - Antes de empezar, el alumno lee las reglas, las acepta y toca **Ingresar al examen**: el examen se muestra recién cuando el navegador confirma la pantalla completa. Si el navegador no la permite o la rechaza, se explica por qué.
  - No hay salidas permitidas. El botón rojo **SALIR** (con confirmación) entrega el examen tal como está: queda como **Salió y se entregó** y no se puede retomar. La entrega normal (**Enviar parcial**) sigue igual y queda como **Entregado**.
  - Salir de pantalla completa, cambiar de pestaña o de ventana, recargar, cerrar o navegar fuera del examen es un **Incidente**: el examen se oculta en el acto, se registra con las últimas respuestas y queda bloqueado. Las señales de una misma salida (fullscreenchange, visibilitychange, blur) cuentan como un solo incidente.
  - **Latido** cada 2 s: si el servidor no lo recibe durante 8 s (corte de Wi-Fi, batería, navegador cerrado), la sesión pasa a Incidente. No hay procesos en segundo plano: el servidor lo revisa en cada consulta (el panel del profesor consulta cada 2 s), así se ve en ≤ 10 s. Sin conexión, los eventos quedan en una cola local y se mandan al volver la red.
  - El profesor puede **reanudar** un Incidente (y solo un Incidente). El alumno ve el aviso sin recargar, toca **Volver al examen**, vuelve a pantalla completa y sigue con sus respuestas y el tiempo exacto que le quedaba al producirse el incidente.
  - **Trazabilidad**: cada inicio, aceptación de reglas, pantalla completa, señal de salida, incidente, salida voluntaria, entrega, reanudación y reconexión queda en `eventos_seguridad` con la hora del servidor. La tabla es append-only: la base rechaza modificar o borrar eventos.
  - Una web no puede impedir Escape, Alt+Tab ni cerrar el navegador: el sistema detecta, oculta, registra y bloquea.
- La sección **Turnos** muestra los parciales publicados en las pestañas **Próximos**, **En curso** y **Finalizados**.
- Vista del alumno: lista de los parciales de los turnos a los que fue asignado, con la fecha y el horario. Solo puede abrir el parcial dentro del horario del turno. El alumno abre un parcial, toca **Comenzar parcial**, lo responde y lo **envía una sola vez**. Después solo puede ver su entrega.
- Examen seguro y persistente:
  - **Temporizador** en `HH:MM:SS` calculado con la hora del servidor y el fin del turno (inicio + duración). El tiempo corre desde que empieza el turno, igual para todos: quien abre el parcial más tarde tiene menos tiempo. Cambiar la hora del dispositivo no lo afecta. Avisos a los 10, 5 y 1 minuto.
  - **Autoguardado**: cada cambio (texto, código, multiple choice, GeoGebra) se guarda en la base a los 300 ms de la última interacción, con el indicador "Guardando…", "Guardado" o "Sin conexión (guardado en caché local)". Sin red, las respuestas quedan en el navegador y se suben solas al volver la conexión.
  - **Reingreso**: las respuestas guardadas y el tiempo se recuperan del servidor; durante el examen, recargar o abrirlo en otro dispositivo cuenta como salida del modo restringido (Incidente) y el profesor decide si reanuda.
  - **Entrega automática**: en 00:00:00 se bloquea la edición y se envía lo respondido. Si el alumno está desconectado, el servidor entrega lo último guardado al pasar la hora límite (se ve como "Enviado por vencimiento").
  - Las fechas y horas de los turnos se interpretan en hora argentina (`ZONA_HORARIA` en `src/config.js`).
- El profesor puede publicar un parcial desde la lista (pestaña Creados) o desde el detalle, siempre que tenga algún turno que todavía no empezó.
- Herramientas: mientras resuelve, el alumno abre desde pestañas a la izquierda las herramientas que habilitó el profesor (calculadora científica y GeoGebra), en una ventanita flotante.
- Entregas: en el detalle de cada parcial publicado y en la sección **Entregas** (pestañas Sin corregir / Corregidas) el profesor ve las respuestas del alumno, cuándo empezó, cuándo entregó y si se envió por tiempo, y la corrige con una nota (0 a 10) y una devolución.
- El alumno tiene sus parciales separados en **A entregar** y **Entregados**; al abrir un parcial entregado ve la nota y la devolución del profesor.
- La sesión es **por pestaña**: se puede tener al profesor en una pestaña y a un alumno en otra. Al abrir una pestaña nueva hay que volver a iniciar sesión.

## Sprint final: corrección automática, revisión y publicación (RF11, RF12, RF13)

- **Criterios y pesos**: cada apartado del parcial tiene un **puntaje** (su peso en la nota) y, salvo Multiple Choice, **criterios de corrección** con su peso relativo. El profesor también define el **umbral de confianza** del parcial. Los alumnos no ven los criterios.
- **Corrección automática**: al entregar (a mano, por tiempo, por el sistema o con SALIR), en la misma transacción se encola una evaluación por pregunta (tabla `evaluaciones`, persistente: no hay tareas en memoria). Después de responder, un **agente juez** independiente por pregunta (API de Claude, `server/juez.js`) recibe solo la consigna, la respuesta, los criterios con pesos y el puntaje máximo, y devuelve JSON validado (criterios cumplidos/parciales/faltantes, puntaje sugerido, feedback y confianza). El puntaje sugerido sale de los criterios y sus pesos; la nota final es la suma de puntajes sobre el total, en escala 0 a 10.
  - Respuesta vacía (o código inicial sin cambios): 0 puntos y **Requiere revisión**, sin llamar al modelo. Multiple Choice se corrige con la opción correcta. GeoGebra queda **pendiente de corrección manual**.
  - Errores (timeout, falla del proveedor, JSON inválido, puntaje fuera de rango): **hasta 2 reintentos**; si siguen fallando, la pregunta queda en **Error** y pasa a corrección manual sin tocar la respuesta. Las demás preguntas siguen.
  - Confianza menor al umbral: **Baja confianza** y alerta de revisión prioritaria (es un indicador del modelo, no una probabilidad calibrada).
  - La cola la procesan, sin bloquear a los alumnos: el mismo pedido de entrega después de responder (`waitUntil` en Vercel), cada consulta del panel docente (como la normalización del Sprint 4) y, opcionalmente, un cron a `GET /api/correcciones/procesar` con `Authorization: Bearer $CRON_SECRET`.
- **Revisión docente** (Entregas → Revisar, o el detalle del turno → **Corrección y notas**): respuestas originales, puntaje sugerido, criterios, feedback, confianza, errores de los jueces, alertas y los **incidentes del modo restringido**. El profesor ajusta puntaje y feedback (validados), la nota se recalcula al guardar y cada cambio queda en el **historial de auditoría** (`auditoria_calificaciones`, append-only: quién, valor anterior y nuevo, fecha). Con un intento iniciado o entregado, las consignas, pesos, criterios y umbral quedan bloqueados (validado en el servidor).
- **Publicación**: individual (con confirmación; se rechaza si alguna pregunta no tiene puntaje y dice cuáles) o **masiva** por turno (publica las listas e informa las pendientes; no duplica).
- **Alumno**: antes de la publicación solo ve **Entregado** o **En corrección** (la API no manda nota, feedback ni puntajes: `GET /api/entregas/:id/resultado` responde 403). Publicada, ve la nota final, el puntaje definitivo y el feedback aprobado de cada pregunta. Nunca recibe criterios, pesos, puntajes sugeridos reemplazados, confianza ni datos del juez; el resultado de otro alumno responde 403.
- **Configuración**: `ANTHROPIC_API_KEY` (obligatoria para la corrección con IA; sin ella las preguntas quedan en cola y el panel lo avisa), opcionales `RENDIX_IA_MODELO`, `RENDIX_IA_FALLBACK` y `CRON_SECRET` (ver `.env.example`). Migración: `db/migrations/003_correccion_automatica.sql` (`npm run db:migrate`). Las entregas que el profesor ya había corregido a mano quedan publicadas con esa nota.

## Pruebas

```bash
npm test
```

Usan el runner de Node (`node:test`) y una base PostgreSQL en memoria ([PGlite](https://pglite.dev), dependencia de desarrollo): no hace falta una base real. Cubren la API del modo restringido (estados, permisos, idempotencia, latido, reanudación, trazabilidad), la detección en el navegador, la migración sobre datos existentes y la corrección automática del Sprint final (`tests/correccionAutomatica.api.test.js`: encolado, jueces independientes, vacías, límites, ponderación, reintentos, baja confianza, ajuste y auditoría, bloqueo de estructura, publicación individual y masiva, permisos del alumno y el flujo integral). En las pruebas el agente juez se reemplaza por un mock; la aplicación usa la API de Claude.

## Build / deploy

```bash
npm run build     # genera dist/
npm run preview   # sirve el build localmente
```

Desplegado en Vercel (preset Vite) en https://rendix.vercel.app. `vercel.json` manda `/api/*` a la función de la API y el resto de las rutas a `index.html`, para que funcione recargar en cualquier URL. Necesita las variables `DATABASE_URL` y `AUTH_SECRET`, y `ANTHROPIC_API_KEY` para la corrección automática.
