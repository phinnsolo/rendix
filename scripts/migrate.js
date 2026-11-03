// Aplica las migraciones pendientes de db/migrations sobre una base existente, sin tocar los datos.
//   node --env-file=.env scripts/migrate.js
import { pool } from '../server/db.js'
import { aplicarMigraciones } from '../server/migraciones.js'

const aplicadas = await aplicarMigraciones((sql) => pool.query(sql))
console.log(aplicadas.length > 0 ? `Migraciones aplicadas: ${aplicadas.join(', ')}` : 'La base ya estaba al día.')
await pool.end()
