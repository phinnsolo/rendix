# Rendix

Plataforma de gestión de exámenes/documentos. **Versión Semana 1**: login de profesor y CRUD básico de documentos.

## Ejecutar localmente

Requiere Node 18+.

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
- Los datos se guardan en el `localStorage` del navegador: cada navegador tiene sus propios documentos, y se pierden si se borran los datos del sitio. No hay base de datos todavía.

## Build / deploy

```bash
npm run build     # genera dist/
npm run preview   # sirve el build localmente
```

Preparado para Vercel (preset Vite). `vercel.json` redirige todas las rutas a `index.html` para que funcione recargar en cualquier URL.
