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

| Usuario | Contraseña | Nombre |
|---|---|---|
| `profesor1` | `rendix123` | Profesor Demo 1 |
| `profesor2` | `rendix123` | Profesor Demo 2 |
| `profesor3` | `rendix123` | Profesor Demo 3 |

Son credenciales fijas definidas en `src/config.js`. Es una solución **temporal** y no segura.

## Alcance actual

- Login de profesor (sin registro ni recuperación de contraseña).
- Documentos: crear, listar, ver, editar y eliminar (título, contenido, fechas).
- Los datos se guardan en el `localStorage` del navegador: cada navegador tiene sus propios documentos, y se pierden si se borran los datos del sitio. No hay base de datos todavía (próximamente: PostgreSQL con Neon).

## Build / deploy

```bash
npm run build     # genera dist/
npm run preview   # sirve el build localmente
```

Desplegado en Vercel (preset Vite) en https://rendix.vercel.app. `vercel.json` redirige todas las rutas a `index.html` para que funcione recargar en cualquier URL.
