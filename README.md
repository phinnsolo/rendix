# Rendix

Plataforma de gestión de exámenes/documentos. **Versión Semana 1**: login de profesor y CRUD básico de documentos.

## Demo en línea

La app está desplegada en Vercel: **https://rendix.vercel.app**

No hace falta instalar nada ni levantarla en localhost para probarla: basta con entrar al link e iniciar sesión con las credenciales de prueba de abajo.

> ⚠️ **Importante: todavía no hay base de datos.** Toda la información se guarda en el `localStorage` del navegador. Eso significa que los documentos quedan guardados **solo en esa PC y en ese navegador**: si entrás desde otra computadora, otro navegador o en modo incógnito, no vas a ver los mismos datos, y se pierden si se borran los datos del sitio.
>
> Más adelante vamos a incorporar una base de datos **PostgreSQL con [Neon](https://neon.tech)** para que la información se comparta entre dispositivos.

## Ejecutar localmente (opcional, para desarrollo)

Solo necesario si querés modificar el código. Requiere Node 18+.

```bash
npm install
npm run dev
```

Abrir http://localhost:5173

## Credenciales de prueba

| Usuario | Contraseña | Nombre | Rol |
|---|---|---|---|
| `profesor1` | `rendix123` | Profesor Demo 1 | profesor |
| `profesor2` | `rendix123` | Profesor Demo 2 | profesor |
| `profesor3` | `rendix123` | Profesor Demo 3 | profesor |
| `alumno1` … `alumno10` | `rendix123` | Alumno Demo 1 … 10 | alumno |
| `dev1` | `rendix123` | Dev Demo | dev |

Son credenciales fijas definidas en `src/config.js`. Es una solución **temporal** y no segura.

Un alumno también puede **crear su cuenta** desde el login ("Crear cuenta"), con nombre, usuario, mail y contraseña (mínimo 6 caracteres). Después entra con el usuario o con el mail. No se puede repetir un usuario ni un mail que ya tenga otra cuenta. Las cuentas nuevas se guardan en el `localStorage` del navegador, con la contraseña sin cifrar, así que también es temporal y solo existen en ese navegador. El profesor las encuentra por nombre, usuario o mail al asignar alumnos a un turno.

## Alcance actual

- Login de dev, profesor y alumno (sin recuperación de contraseña). Cada rol solo puede entrar a sus pantallas.
- Clases: el **dev** ve todas las clases en cuadritos y crea nuevas con nombre, día de la semana, turno, profesores y alumnos. Cada clase se dicta siempre el mismo día y en el mismo turno. Al entrar, el **profesor** y el **alumno** ven en cuadritos las clases que tienen asignadas (el alumno tiene sus parciales en la sección **Parciales**). Hay dos clases predefinidas en `src/config.js`: **Matemáticas** (lunes, turno mañana; profesor1; alumno1 a alumno5) y **Física** (miércoles, turno tarde; profesor2; alumno4 a alumno8). Las que crea el dev se guardan en el navegador. Por ahora los parciales todavía no están conectados a las clases.
- Parciales del profesor: crear, listar, ver, editar y eliminar, separados en las pestañas **Creados** y **Publicados**. Desde Creados se puede **publicar** un parcial.
- Duración: al crear un parcial el profesor elige cuántos minutos dura (máximo 120). Los parciales anteriores quedan sin límite de tiempo.
- Turnos: hay tres turnos fijos, definidos en `src/config.js`: mañana (07:45 a 11:45), tarde (13:30 a 17:30) y noche (18:30 a 22:30). Al crear o editar un parcial el profesor le asigna uno o más turnos, con la fecha y la hora de inicio. El fin es la hora de inicio más la duración. La hora de inicio se habilita recién cuando hay duración y turno, y no se acepta si el parcial terminaría después del fin del turno (ej. 120 min en el turno mañana tiene que empezar entre 07:45 y 09:45) ni si ya pasó. Un turno se puede cambiar o quitar solo antes de que empiece, y la duración queda fija cuando alguno ya empezó.
- Alumnos y seguimiento: desde el detalle del parcial, en cada turno asignado el profesor busca alumnos por nombre, los asigna y sigue en vivo quién **no abrió**, quién lo tiene **abierto**, quién lo **envió** y, al terminar, quién **no completó**, con la hora de apertura y de envío de cada uno.
- La sección **Turnos** muestra los parciales publicados en las pestañas **Próximos**, **En curso** y **Finalizados**.
- Vista del alumno: lista de los parciales de los turnos a los que fue asignado, con la fecha y el horario. Solo puede abrir el parcial dentro del horario del turno. El alumno abre un parcial, toca **Comenzar parcial** (se registra la apertura y corre el tiempo restante, que no se reinicia al recargar ni pasa del fin del turno), lo responde y lo **envía una sola vez**. Si se termina el tiempo, se envía solo. Después solo puede ver su entrega.
- El profesor puede publicar un parcial desde la lista (pestaña Creados) o desde el detalle, siempre que tenga algún turno que todavía no empezó.
- Herramientas: mientras resuelve, el alumno abre desde pestañas a la izquierda las herramientas que habilitó el profesor (calculadora científica y GeoGebra), en una ventanita flotante.
- Entregas: en el detalle de cada parcial publicado y en la sección **Entregas** (pestañas Sin corregir / Corregidas) el profesor ve las respuestas del alumno, cuándo empezó, cuándo entregó y si se envió por tiempo, y la corrige con una nota (0 a 10) y una devolución.
- El alumno tiene sus parciales separados en **A entregar** y **Entregados**; al abrir un parcial entregado ve la nota y la devolución del profesor.
- Los datos se guardan en el `localStorage` del navegador: cada navegador tiene sus propios parciales, y se pierden si se borran los datos del sitio. No hay base de datos todavía (próximamente: PostgreSQL con Neon). Como no hay backend, profesor y alumno tienen que usar **el mismo navegador** para ver publicaciones y entregas del otro. La sesión es **por pestaña**: se puede tener al profesor en una pestaña y a un alumno en otra para ver el seguimiento en vivo. Al abrir una pestaña nueva hay que volver a iniciar sesión.

## Build / deploy

```bash
npm run build     # genera dist/
npm run preview   # sirve el build localmente
```

Desplegado en Vercel (preset Vite) en https://rendix.vercel.app. `vercel.json` redirige todas las rutas a `index.html` para que funcione recargar en cualquier URL.
