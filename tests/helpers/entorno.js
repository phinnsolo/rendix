// Entorno de pruebas de la API: una base PostgreSQL real en memoria (PGlite) servida por socket, para que
// server/db.js se conecte con `pg` igual que a Neon. Se aplican db/schema.sql y las migraciones, y se cargan
// usuarios, una clase y un parcial que se está tomando ahora.
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

export async function crearEntorno() {
  const db = await PGlite.create()
  const port = 20000 + Math.floor(Math.random() * 20000)
  const servidor = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })
  await servidor.start()
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
  // PGlite atiende una conexión a la vez: con una sola en el pool, las transacciones no se mezclan.
  process.env.DATABASE_POOL_MAX = '1'
  process.env.AUTH_SECRET ??= 'secreto-de-pruebas'

  const { pool } = await import('../../server/db.js')
  const { handle } = await import('../../server/router.js')
  const { aplicarMigraciones } = await import('../../server/migraciones.js')
  const { hashPassword } = await import('../../server/auth.js')

  await pool.query(await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8'))
  await aplicarMigraciones((sql) => pool.query(sql))

  const hash = await hashPassword('rendix123')
  const usuarios = [
    ['profesor1', 'Prof. Juan Pérez', 'profesor'],
    ['profesor2', 'Profesor Demo 2', 'profesor'],
    ['alumno1', 'Alumno Demo 1', 'alumno'],
    ['alumno2', 'Alumno Demo 2', 'alumno'],
    ['alumno3', 'Alumno Demo 3', 'alumno'],
  ]
  for (const [username, nombre, rol] of usuarios) {
    await pool.query('insert into usuarios (username, nombre, rol, password_hash) values ($1, $2, $3, $4)', [username, nombre, rol, hash])
  }

  // Llama a la API como lo hace Vercel (el body ya viene parseado) y devuelve { status, body }.
  async function api(method, path, { token, body } = {}) {
    const req = { method, url: path, headers: token ? { authorization: `Bearer ${token}` } : {}, body: body ?? (method === 'GET' ? undefined : {}) }
    return new Promise((resolve) => {
      const res = {
        statusCode: 200,
        setHeader() {},
        end(texto) {
          resolve({ status: this.statusCode, body: JSON.parse(texto) })
        },
      }
      handle(req, res)
    })
  }

  async function login(usuario) {
    const { body } = await api('POST', '/api/login', { body: { usuario, password: 'rendix123' } })
    return body.token
  }

  const tokens = Object.fromEntries(await Promise.all(usuarios.map(async ([u]) => [u, await login(u)])))

  await pool.query(
    `insert into clases (id, nombre, dia, turno, profesores, alumnos) values ('clase1', 'Matemáticas', 'lunes', 'manana', $1, $2)`,
    [['profesor1'], ['alumno1', 'alumno2', 'alumno3']]
  )

  let n = 0
  // Un parcial nuevo de profesor1 que se empieza a tomar ahora ("Tomar ahora"), con los alumnos de la clase.
  async function parcialEnCurso({ duracion = 60 } = {}) {
    n += 1
    const id = `parcial${n}`
    const bloques = [
      { id: 'b1', tipo: 'texto', consigna: '¿Cuánto es 2 + 2?', contenido: '' },
      { id: 'b2', tipo: 'texto', consigna: 'Explicá por qué.', contenido: '' },
    ]
    await pool.query(
      `insert into documentos (id, profesor, clase_id, titulo, tema, duracion, bloques) values ($1, 'profesor1', 'clase1', $2, 'Tema 1', $3, $4)`,
      [id, `Parcial ${n}`, duracion, JSON.stringify(bloques)]
    )
    const { status, body } = await api('POST', `/api/documentos/${id}/tomar-ahora`, { token: tokens.profesor1 })
    if (status !== 200) throw new Error(`tomar-ahora: ${status} ${JSON.stringify(body)}`)
    return { parcialId: id, turnoId: body.turnoId }
  }

  async function cerrar() {
    await pool.end()
    await servidor.stop()
    await db.close()
  }

  // `db`: la base PGlite directa (para comprobar reglas de la base sin pasar por la API).
  return { api, pool, db, tokens, parcialEnCurso, cerrar }
}

let seq = 0
export const nuevoId = () => `evento-${Date.now()}-${++seq}`
