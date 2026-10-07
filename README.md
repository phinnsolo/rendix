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
| `alumno1` | `rendix123` | Alumno Demo 1 | alumno de `profesor1` |
| `alumno2` | `rendix123` | Alumno Demo 2 | alumno de `profesor2` |
| `alumno3` | `rendix123` | Alumno Demo 3 | alumno de `profesor3` |

Son credenciales fijas definidas en `src/config.js`. Es una solución **temporal** y no segura.

## Alcance actual

- Login de profesor y de alumno (sin registro ni recuperación de contraseña). Cada rol solo puede entrar a sus pantallas.
- Parciales del profesor: crear, listar, ver, editar y eliminar, separados en las pestañas **Creados** y **Publicados**. Desde Creados se puede **publicar** un parcial.
- Duración: al crear un parcial el profesor elige cuántos minutos tiene el alumno (máximo 120). Los parciales anteriores quedan sin límite de tiempo.
- Vista del alumno: lista de los parciales publicados por su profesor. El alumno abre un parcial, toca **Comenzar parcial** (desde ahí corre el tiempo restante, que no se reinicia al recargar), lo responde y lo **envía una sola vez**. Si se termina el tiempo, se envía solo. Después solo puede ver su entrega.
- El profesor puede publicar un parcial desde la lista (pestaña Creados) o desde el detalle, apenas lo crea.
- Herramientas: mientras resuelve, el alumno abre desde pestañas a la izquierda las herramientas que habilitó el profesor (calculadora científica y GeoGebra), en una ventanita flotante.
- Entregas: en el detalle de cada parcial publicado y en la sección **Entregas** (pestañas Sin corregir / Corregidas) el profesor ve las respuestas del alumno, cuándo empezó, cuándo entregó y si se envió por tiempo, y la corrige con una nota (0 a 10) y una devolución.
- El alumno tiene sus parciales separados en **A entregar** y **Entregados**; al abrir un parcial entregado ve la nota y la devolución del profesor.
- Los datos se guardan en el `localStorage` del navegador: cada navegador tiene sus propios parciales, y se pierden si se borran los datos del sitio. No hay base de datos todavía (próximamente: PostgreSQL con Neon). Como no hay backend, profesor y alumno tienen que usar **el mismo navegador** para ver publicaciones y entregas del otro.

## Build / deploy

```bash
npm run build     # genera dist/
npm run preview   # sirve el build localmente
```

Desplegado en Vercel (preset Vite) en https://rendix.vercel.app. `vercel.json` redirige todas las rutas a `index.html` para que funcione recargar en cualquier URL.
