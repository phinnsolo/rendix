// Migraciones de la base: los archivos de db/migrations se aplican en orden alfabético, una sola vez cada uno
// (quedan anotados en la tabla `migraciones`). Cada archivo es idempotente y no borra datos.
import { readFile, readdir } from 'node:fs/promises'

const DIRECTORIO = new URL('../db/migrations/', import.meta.url)

// `ejecutar(sql)` corre SQL contra la base (pool.query o el cliente de pruebas). Devuelve los nombres aplicados.
export async function aplicarMigraciones(ejecutar) {
  await ejecutar('create table if not exists migraciones (nombre text primary key, fecha timestamptz not null default now())')
  const { rows } = await ejecutar('select nombre from migraciones')
  const hechas = new Set(rows.map((r) => r.nombre))
  const archivos = (await readdir(DIRECTORIO)).filter((f) => f.endsWith('.sql')).sort()
  const aplicadas = []
  for (const nombre of archivos) {
    if (hechas.has(nombre)) continue
    const sql = await readFile(new URL(nombre, DIRECTORIO), 'utf8')
    await ejecutar(`begin;\n${sql}\ninsert into migraciones (nombre) values ('${nombre.replaceAll("'", "''")}');\ncommit;`)
    aplicadas.push(nombre)
  }
  return aplicadas
}
