// Conexión a PostgreSQL (Neon en producción). DATABASE_URL viene de las variables de entorno de Vercel
// o del archivo .env en desarrollo.
import pg from 'pg'

// Las columnas `date` se leen como 'YYYY-MM-DD' (sin convertirlas a medianoche en la zona del servidor).
pg.types.setTypeParser(1082, (valor) => valor)

// fable: pool chico por instancia de función; con mucho tráfico usar la URL "pooled" de Neon.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 })

export function query(text, params) {
  return pool.query(text, params)
}

// Ejecuta `fn(client)` dentro de una transacción: si lanza, se deshace todo.
export async function tx(fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
}
