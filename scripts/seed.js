// Crea las tablas y carga las cuentas y clases predefinidas. Se puede correr más de una vez:
// no pisa datos existentes.
//   node --env-file=.env scripts/seed.js
import { readFile } from 'node:fs/promises'
import { CLASES } from '../src/config.js'
import { hashPassword } from '../server/auth.js'
import { pool } from '../server/db.js'
import { ALUMNOS, DEVS, PROFESORES } from './seed-data.js'

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')
await pool.query(schema)

for (const u of [...DEVS, ...PROFESORES, ...ALUMNOS]) {
  await pool.query(
    'insert into usuarios (username, nombre, rol, password_hash) values ($1, $2, $3, $4) on conflict do nothing',
    [u.username, u.nombre, u.rol, await hashPassword(u.password)]
  )
}

for (const c of CLASES) {
  await pool.query(
    `insert into clases (id, nombre, dia, turno, profesores, alumnos, predefinida)
     values ($1, $2, $3, $4, $5, $6, true) on conflict do nothing`,
    [c.id, c.nombre, c.dia, c.turno, c.profesores, c.alumnos]
  )
}

console.log('Base lista.')
await pool.end()
