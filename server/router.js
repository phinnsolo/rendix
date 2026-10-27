// API de Rendix: un solo punto de entrada (api/index.js en Vercel, middleware de Vite en desarrollo).
// Cada ruta controla el rol y que el usuario sea dueño de lo que toca; las reglas vienen de src/.

import { leerToken, crearToken, hashPassword, verifyPassword } from './auth.js'
import { query, tx } from './db.js'
import { HttpError, enviar, leerBody } from './http.js'
import {
  TOLERANCIA_MS, aClase, aDocumento, aEntrega, aSesion, aTurno, aUsuario, aperturasDe, crearEntrega, finalizarVencidas,
  guardarTurnos, turnosParaCambiar,
} from './datos.js'
import { TEMAS } from '../src/config.js'
import { validateClase } from '../src/clases.js'
import { validateRegistro } from '../src/registro.js'
import { BLOCK_TYPES, textFromBlocks, validateBlocks } from '../src/documentBlocks.js'
import { getDuracion, getHerramientas, isValidDuracion } from '../src/examSettings.js'
import {
  aplicarAsignacion, aplicarBorrarVacios, aplicarCambioAlumnos, aplicarHorarios, aplicarQuitarAlumno, estadoTurno, hasStarted,
  nuevoTurnoAhora, turnoFin, validateHorario,
} from '../src/turnos.js'

const rutas = []
function ruta(metodo, patron, rol, handler) {
  const regex = new RegExp(`^${patron.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`)
  rutas.push({ metodo, regex, rol, handler })
}

export async function handle(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname.replace(/\/+$/, '')
    const candidatas = rutas.filter((r) => r.regex.test(path))
    const match = candidatas.find((r) => r.metodo === req.method)
    if (!match) throw new HttpError(candidatas.length > 0 ? 405 : 404, 'Ruta inexistente.')
    const params = Object.fromEntries(Object.entries(path.match(match.regex).groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]))
    let sesion = null
    if (match.rol) {
      sesion = leerToken(req.headers.authorization?.replace(/^Bearer /, ''))
      if (!sesion) throw new HttpError(401, 'Tu sesión venció. Volvé a iniciar sesión.')
      if (match.rol !== '*' && sesion.rol !== match.rol) throw new HttpError(403, 'No tenés permiso para esto.')
    }
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await leerBody(req)
    const resultado = await match.handler({ params, body, sesion, query: url.searchParams })
    enviar(res, 200, resultado ?? {})
  } catch (e) {
    if (e instanceof HttpError) return enviar(res, e.status, { error: e.message, ...e.extra })
    logError(req, e)
    enviar(res, 500, { error: 'Error del servidor. Probá de nuevo.' })
  }
}

// Log de un error inesperado (lo muestran los logs de Vercel). Incluye el código (ej. ECONNREFUSED, o el SQLSTATE
// de Postgres) y los errores internos de un AggregateError, que es lo que lanza `pg` cuando no puede conectarse
// y que suele venir con el mensaje vacío. No incluye el body ni los headers del pedido.
function logError(req, e) {
  const internos = Array.isArray(e?.errors) ? e.errors : []
  console.error(
    `[api] ${req.method} ${req.url} → ${e?.name ?? 'Error'}${e?.code ? ` (${e.code})` : ''}: ${e?.message || '(sin mensaje)'}`,
    `\n${e?.stack ?? ''}`,
    ...internos.map((i) => `\n  causa: ${i?.code ? `(${i.code}) ` : ''}${i?.message ?? i}`)
  )
}

function validacion(errores) {
  if (Object.keys(errores).length > 0) throw new HttpError(400, Object.values(errores)[0], { errores })
}

const esTexto = (v, max = 10_000) => typeof v === 'string' && v.length <= max
const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// --- Cuentas

ruta('POST', '/api/login', null, async ({ body }) => {
  const buscado = String(body.usuario ?? '').trim().toLowerCase()
  const { rows } = await query('select * from usuarios where lower(username) = $1 or lower(email) = $1', [buscado])
  const usuario = rows[0]
  if (!usuario || !(await verifyPassword(String(body.password ?? ''), usuario.password_hash))) {
    throw new HttpError(401, 'Usuario o contraseña incorrectos.')
  }
  const sesion = { username: usuario.username, nombre: usuario.nombre, rol: usuario.rol }
  return { sesion, token: crearToken(sesion) }
})

ruta('POST', '/api/registro', null, async ({ body }) => {
  const errores = validateRegistro(body)
  validacion(errores)
  const username = body.usuario.trim().toLowerCase()
  const email = body.email.trim().toLowerCase()
  const { rows: enUso } = await query(
    'select username, email from usuarios where lower(username) = any($1) or lower(email) = any($1)',
    [[username, email]]
  )
  if (enUso.some((u) => u.username.toLowerCase() === username || u.email === username)) errores.usuario = 'Ese usuario ya está en uso.'
  if (enUso.some((u) => u.username.toLowerCase() === email || u.email === email)) errores.email = 'Ya hay una cuenta con ese mail.'
  validacion(errores)
  const sesion = { username, nombre: body.nombre.trim(), rol: 'alumno' }
  await query('insert into usuarios (username, nombre, email, rol, password_hash) values ($1, $2, $3, $4, $5)', [
    username, sesion.nombre, email, 'alumno', await hashPassword(body.password),
  ])
  return { sesion, token: crearToken(sesion) }
})

// --- Datos que ve cada usuario (el frontend los guarda en memoria y los lee desde los stores)

ruta('GET', '/api/datos', '*', async ({ sesion }) => {
  const yo = sesion.username
  if (sesion.rol === 'dev') {
    const [usuarios, clases] = await Promise.all([
      query("select * from usuarios where rol in ('profesor', 'alumno')"),
      query('select * from clases'),
    ])
    return { usuarios: usuarios.rows.map(aUsuario), clases: clases.rows.map(aClase), documentos: [], turnos: [], entregas: [] }
  }

  if (sesion.rol === 'profesor') {
    await tx((c) => finalizarVencidas(c, 's.turno_id in (select id from turnos where profesor = $1)', yo))
    const [usuarios, clases, documentos, turnos, entregas] = await Promise.all([
      query("select * from usuarios where rol in ('profesor', 'alumno')"),
      query('select * from clases where $1 = any(profesores)', [yo]),
      query('select * from documentos where profesor = $1', [yo]),
      query('select * from turnos where profesor = $1', [yo]),
      query('select * from entregas where profesor = $1', [yo]),
    ])
    const aperturas = await aperturasDe({ query }, turnos.rows.map((t) => t.id))
    return {
      usuarios: usuarios.rows.map(aUsuario),
      clases: clases.rows.map(aClase),
      documentos: documentos.rows.map((r) => aDocumento(r)),
      turnos: turnos.rows.map((t) => aTurno(t, aperturas[t.id])),
      entregas: entregas.rows.map((r) => aEntrega(r)),
    }
  }

  // Alumno: solo los parciales publicados de sus turnos, sin las respuestas correctas ni los otros alumnos.
  await tx((c) => finalizarVencidas(c, 's.alumno = $1', yo))
  const [usuarios, clases, turnos, entregas] = await Promise.all([
    query("select * from usuarios where rol = 'profesor' or username = $1", [yo]),
    query('select * from clases where $1 = any(alumnos)', [yo]),
    query(
      `select t.* from turnos t join documentos d on d.id = t.parcial_id
       where $1 = any(t.alumnos) and d.estado = 'publicado'`,
      [yo]
    ),
    query('select * from entregas where alumno = $1', [yo]),
  ])
  const parcialIds = [...new Set([...turnos.rows.map((t) => t.parcial_id), ...entregas.rows.map((e) => e.parcial_id)])]
  const documentos = await query("select * from documentos where id = any($1) and estado = 'publicado'", [parcialIds])
  const aperturas = await aperturasDe({ query }, turnos.rows.map((t) => t.id), yo)
  return {
    usuarios: usuarios.rows.map(aUsuario),
    clases: clases.rows.map(aClase),
    documentos: documentos.rows.map((r) => aDocumento(r, { paraAlumno: true })),
    turnos: turnos.rows.map((t) => ({ ...aTurno(t, aperturas[t.id]), alumnos: [yo] })),
    entregas: entregas.rows.map((r) => aEntrega(r, { paraAlumno: true })),
  }
})

// --- Clases (dev)

async function validarMiembros(client, { profesores, alumnos }) {
  const { rows } = await client.query('select username, rol from usuarios where username = any($1)', [[...profesores, ...alumnos]])
  const rol = new Map(rows.map((r) => [r.username, r.rol]))
  const errores = {}
  if (profesores.some((u) => rol.get(u) !== 'profesor')) errores.profesores = 'Algún profesor no existe.'
  if (alumnos.some((u) => rol.get(u) !== 'alumno')) errores.alumnos = 'Algún alumno no existe.'
  validacion(errores)
}

ruta('POST', '/api/clases', 'dev', async ({ body }) => {
  validacion(validateClase(body))
  return tx(async (c) => {
    await validarMiembros(c, body)
    const { rows } = await c.query(
      'insert into clases (id, nombre, dia, turno, profesores, alumnos) values ($1, $2, $3, $4, $5, $6) returning *',
      [crypto.randomUUID(), body.nombre.trim(), body.dia, body.turno, [...new Set(body.profesores)], [...new Set(body.alumnos)]]
    )
    return { clase: aClase(rows[0]) }
  })
})

// Los alumnos agregados quedan asignados a los parciales de la clase que todavía no se tomaron, y los quitados
// salen de ellos.
ruta('PUT', '/api/clases/:id', 'dev', async ({ params, body }) => {
  validacion(validateClase(body))
  return tx(async (c) => {
    await validarMiembros(c, body)
    const { rows: [anterior] } = await c.query('select * from clases where id = $1 for update', [params.id])
    if (!anterior) throw new HttpError(404, 'La clase no existe.')
    const profesores = [...new Set(body.profesores)]
    const alumnos = [...new Set(body.alumnos)]
    const { rows } = await c.query(
      `update clases set nombre = $2, dia = $3, turno = $4, profesores = $5, alumnos = $6, fecha_modificacion = now()
       where id = $1 returning *`,
      [params.id, body.nombre.trim(), body.dia, body.turno, profesores, alumnos]
    )
    const agregados = alumnos.filter((a) => !anterior.alumnos.includes(a))
    const quitados = anterior.alumnos.filter((a) => !alumnos.includes(a))
    if (agregados.length > 0 || quitados.length > 0) {
      for (const profesor of new Set([...anterior.profesores, ...profesores])) {
        const { rows: docs } = await c.query('select id from documentos where profesor = $1 and clase_id = $2', [profesor, params.id])
        if (docs.length === 0) continue
        const antes = await turnosParaCambiar(c, profesor)
        const despues = docs.reduce((turnos, d) => aplicarCambioAlumnos(turnos, d.id, agregados, quitados, Date.now()), antes)
        await guardarTurnos(c, antes, despues)
      }
    }
    return { clase: aClase(rows[0]) }
  })
})

// --- Parciales (profesor)

async function documentoPropio(client, id, profesor, { bloquear = false } = {}) {
  const { rows } = await client.query(`select * from documentos where id = $1${bloquear ? ' for update' : ''}`, [id])
  if (!rows[0] || rows[0].profesor !== profesor) throw new HttpError(404, 'El parcial no existe.')
  return rows[0]
}

// Valida los campos del formulario de parcial y devuelve los valores limpios.
async function validarDocumento(client, body, profesor) {
  const { rows: [clase] } = await client.query('select * from clases where id = $1', [String(body.claseId ?? '')])
  if (!clase || !clase.profesores.includes(profesor)) throw new HttpError(400, 'Elegí una clase.')
  if (!esTexto(body.titulo, 200) || !body.titulo.trim()) throw new HttpError(400, 'El título es obligatorio.')
  if (!TEMAS.includes(body.tema)) throw new HttpError(400, 'Elegí un tema.')
  if (!isValidDuracion(body.duracion)) throw new HttpError(400, 'La duración no es válida.')
  const bloques = body.bloques
  if (!Array.isArray(bloques) || bloques.some((b) => !esObjeto(b) || !BLOCK_TYPES[b.tipo] || typeof b.id !== 'string')) {
    throw new HttpError(400, 'Los apartados no son válidos.')
  }
  const errorBloques = validateBlocks(bloques)
  if (errorBloques) throw new HttpError(400, errorBloques)
  const horarios = Array.isArray(body.horarios) ? body.horarios : []
  for (const h of horarios) {
    if (!esObjeto(h)) throw new HttpError(400, 'Revisá los turnos asignados.')
    const errores = validateHorario(h, body.duracion, Date.now())
    if (Object.keys(errores).length > 0) throw new HttpError(400, Object.values(errores)[0])
  }
  return {
    clase,
    valores: {
      claseId: clase.id,
      titulo: body.titulo.trim(),
      tema: body.tema,
      herramientas: getHerramientas(body),
      duracion: body.duracion,
      bloques,
    },
    horarios: horarios.map(({ id, turno, fecha, horaInicio }) => ({ id: typeof id === 'string' ? id : undefined, turno, fecha, horaInicio })),
  }
}

ruta('POST', '/api/documentos', 'profesor', async ({ body, sesion }) =>
  tx(async (c) => {
    const { clase, valores: v, horarios } = await validarDocumento(c, body, sesion.username)
    if (horarios.length === 0) throw new HttpError(400, 'Asigná al menos un turno.')
    const { rows } = await c.query(
      `insert into documentos (id, profesor, clase_id, titulo, tema, herramientas, duracion, bloques, contenido)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [crypto.randomUUID(), sesion.username, v.claseId, v.titulo, v.tema, v.herramientas, v.duracion, JSON.stringify(v.bloques), textFromBlocks(v.bloques)]
    )
    const antes = await turnosParaCambiar(c, sesion.username)
    const despues = aplicarHorarios(antes, {
      profesor: sesion.username, parcialId: rows[0].id, horarios, duracion: v.duracion, alumnosClase: clase.alumnos,
    }, Date.now())
    await guardarTurnos(c, antes, despues)
    return { documento: aDocumento(rows[0]) }
  })
)

ruta('PUT', '/api/documentos/:id', 'profesor', async ({ params, body, sesion }) =>
  tx(async (c) => {
    const anterior = await documentoPropio(c, params.id, sesion.username, { bloquear: true })
    const { clase, valores: v, horarios } = await validarDocumento(c, body, sesion.username)
    const antes = await turnosParaCambiar(c, sesion.username)
    // La duración queda fija cuando algún turno del parcial ya empezó.
    if (v.duracion !== anterior.duracion && antes.some((t) => t.parcialId === params.id && hasStarted(t, Date.now()))) {
      throw new HttpError(400, 'La duración no se puede cambiar: el parcial ya se empezó a tomar.')
    }
    const { rows } = await c.query(
      `update documentos set clase_id = $2, titulo = $3, tema = $4, herramientas = $5, duracion = $6, bloques = $7, contenido = $8,
       fecha_modificacion = now() where id = $1 returning *`,
      [params.id, v.claseId, v.titulo, v.tema, v.herramientas, v.duracion, JSON.stringify(v.bloques), textFromBlocks(v.bloques)]
    )
    const despues = aplicarHorarios(antes, {
      profesor: sesion.username, parcialId: params.id, horarios, duracion: v.duracion, alumnosClase: clase.alumnos,
    }, Date.now())
    await guardarTurnos(c, antes, despues)
    return { documento: aDocumento(rows[0]) }
  })
)

ruta('POST', '/api/documentos/:id/publicar', 'profesor', async ({ params, sesion }) =>
  tx(async (c) => {
    await documentoPropio(c, params.id, sesion.username, { bloquear: true })
    const { rows: turnos } = await c.query('select * from turnos where parcial_id = $1', [params.id])
    if (!turnos.some((t) => estadoTurno(aTurno(t), Date.now()) === 'proximo')) {
      throw new HttpError(400, 'Para publicarlo, asignale un turno que todavía no haya empezado.')
    }
    await c.query(
      "update documentos set estado = 'publicado', fecha_publicacion = coalesce(fecha_publicacion, now()) where id = $1",
      [params.id]
    )
    return {}
  })
)

ruta('DELETE', '/api/documentos/:id', 'profesor', async ({ params, sesion }) =>
  tx(async (c) => {
    await documentoPropio(c, params.id, sesion.username, { bloquear: true })
    await c.query('delete from documentos where id = $1', [params.id])
    return {}
  })
)

// "Tomar ahora": abre un turno que empieza en este momento con todos los alumnos de la clase y publica el
// parcial. Los alumnos que estaban en un turno que no empezó se pasan a este; los turnos que quedan vacíos se borran.
ruta('POST', '/api/documentos/:id/tomar-ahora', 'profesor', async ({ params, sesion }) =>
  tx(async (c) => {
    const doc = await documentoPropio(c, params.id, sesion.username, { bloquear: true })
    const { rows: [clase] } = await c.query('select * from clases where id = $1', [doc.clase_id])
    const duracion = getDuracion(doc)
    if (!clase) throw new HttpError(400, 'Asignale una clase al parcial.')
    if (!isValidDuracion(duracion)) throw new HttpError(400, 'El parcial no tiene duración.')
    const ahora = Date.now()
    const antes = await turnosParaCambiar(c, sesion.username)
    if (antes.some((t) => t.parcialId === doc.id && estadoTurno(t, ahora) === 'en-curso')) {
      throw new HttpError(409, 'El parcial ya se está tomando en otro turno.')
    }
    const turno = nuevoTurnoAhora({ profesor: sesion.username, parcialId: doc.id, duracion }, ahora)
    const { turnos } = aplicarAsignacion([...antes, turno], turno.id, clase.alumnos, ahora)
    await guardarTurnos(c, antes, aplicarBorrarVacios(turnos, doc.id, ahora))
    await c.query(
      "update documentos set estado = 'publicado', fecha_publicacion = coalesce(fecha_publicacion, now()) where id = $1",
      [doc.id]
    )
    return { turnoId: turno.id }
  })
)

// --- Turnos (profesor)

ruta('POST', '/api/turnos/:id/alumnos', 'profesor', async ({ params, body, sesion }) =>
  tx(async (c) => {
    const usernames = Array.isArray(body.usernames) ? body.usernames.filter((u) => typeof u === 'string') : []
    const { rows } = await c.query("select username from usuarios where rol = 'alumno' and username = any($1)", [usernames])
    if (rows.length !== new Set(usernames).size) throw new HttpError(400, 'Algún alumno no existe.')
    const antes = await turnosParaCambiar(c, sesion.username)
    let resultado
    try {
      resultado = aplicarAsignacion(antes, params.id, usernames, Date.now())
    } catch (e) {
      throw new HttpError(400, e.message)
    }
    await guardarTurnos(c, antes, resultado.turnos)
    return { rechazados: resultado.rechazados }
  })
)

ruta('DELETE', '/api/turnos/:id/alumnos/:username', 'profesor', async ({ params, sesion }) =>
  tx(async (c) => {
    const antes = await turnosParaCambiar(c, sesion.username)
    let despues
    try {
      despues = aplicarQuitarAlumno(antes, params.id, params.username, Date.now())
    } catch (e) {
      throw new HttpError(400, e.message)
    }
    await guardarTurnos(c, antes, despues)
    return {}
  })
)

// Seguimiento en vivo de un turno: sesión y entrega de cada alumno asignado.
ruta('GET', '/api/turnos/:id/seguimiento', 'profesor', async ({ params, sesion }) => {
  const { rows: [turno] } = await query('select * from turnos where id = $1 and profesor = $2', [params.id, sesion.username])
  if (!turno) throw new HttpError(404, 'El turno no existe.')
  await tx((c) => finalizarVencidas(c, 's.turno_id = $1', turno.id))
  const [sesiones, entregas] = await Promise.all([
    query('select * from sesiones_examen where turno_id = $1', [turno.id]),
    query('select * from entregas where parcial_id = $1 and alumno = any($2)', [turno.parcial_id, turno.alumnos]),
  ])
  const porAlumno = new Map(sesiones.rows.map((s) => [s.alumno, aSesion(s)]))
  const entregaDe = new Map(entregas.rows.map((e) => [e.alumno, aEntrega(e)]))
  return {
    alumnos: turno.alumnos.map((username) => {
      const s = porAlumno.get(username)
      const e = entregaDe.get(username)
      return {
        username,
        sesion: s ? { apertura: s.apertura, deadline: s.deadline, ultimoGuardado: s.ultimoGuardado, ultimoLatido: s.ultimoLatido, pendientes: s.pendientes, estado: s.estado } : null,
        entrega: e ? { id: e.id, fechaInicio: e.fechaInicio, fechaEntrega: e.fechaEntrega, enviadoPorTiempo: e.enviadoPorTiempo, enviadoPorSistema: e.enviadoPorSistema } : null,
      }
    }),
  }
})

// --- Entregas (profesor)

ruta('PUT', '/api/entregas/:id/correccion', 'profesor', async ({ params, body, sesion }) => {
  const nota = body.nota
  if (typeof nota !== 'number' || !Number.isFinite(nota) || nota < 0 || nota > 10) {
    throw new HttpError(400, 'La nota tiene que ser un número entre 0 y 10.')
  }
  if (!esTexto(body.comentario ?? '', 10_000)) throw new HttpError(400, 'La devolución es demasiado larga.')
  const correccion = { nota, comentario: (body.comentario ?? '').trim(), fecha: new Date().toISOString() }
  const { rows } = await query(
    'update entregas set correccion = $3 where id = $1 and profesor = $2 returning *',
    [params.id, sesion.username, correccion]
  )
  if (!rows[0]) throw new HttpError(404, 'La entrega no existe.')
  return { entrega: aEntrega(rows[0]) }
})

// --- Examen (alumno)
// La sesión guarda la hora límite: la duración desde la apertura o el fin del turno, lo que llegue antes.
// Toda la hora es la del servidor.

async function turnoDelAlumno(client, parcialId, alumno) {
  const { rows } = await client.query(
    `select t.* from turnos t join documentos d on d.id = t.parcial_id
     where t.parcial_id = $1 and $2 = any(t.alumnos) and d.estado = 'publicado' limit 1`,
    [parcialId, alumno]
  )
  if (!rows[0]) throw new HttpError(404, 'El parcial no existe.')
  return rows[0]
}

async function entregaDelAlumno(client, parcialId, alumno) {
  const { rows } = await client.query('select * from entregas where parcial_id = $1 and alumno = $2', [parcialId, alumno])
  return rows[0] ? aEntrega(rows[0], { paraAlumno: true }) : null
}

async function sesionDelAlumno(client, parcialId, alumno, { bloquear = false } = {}) {
  const { rows } = await client.query(
    `select * from sesiones_examen where parcial_id = $1 and alumno = $2${bloquear ? ' for update' : ''}`,
    [parcialId, alumno]
  )
  return rows[0] ?? null
}

ruta('GET', '/api/examen/:parcialId', 'alumno', async ({ params, sesion }) => {
  const yo = sesion.username
  await tx((c) => finalizarVencidas(c, 's.alumno = $1', yo))
  const entrega = await entregaDelAlumno({ query }, params.parcialId, yo)
  const turno = await turnoDelAlumno({ query }, params.parcialId, yo).catch((e) => {
    if (entrega) return null
    throw e
  })
  const { rows: [doc] } = await query('select * from documentos where id = $1', [params.parcialId])
  const s = await sesionDelAlumno({ query }, params.parcialId, yo)
  return {
    turno: turno ? { ...aTurno(turno), alumnos: [yo] } : null,
    documento: doc ? aDocumento(doc, { paraAlumno: true }) : null,
    sesion: s ? aSesion(s) : null,
    entrega,
  }
})

ruta('POST', '/api/examen/:parcialId/comenzar', 'alumno', async ({ params, sesion }) =>
  tx(async (c) => {
    const yo = sesion.username
    const turno = await turnoDelAlumno(c, params.parcialId, yo)
    const existente = await sesionDelAlumno(c, params.parcialId, yo)
    if (existente) return { sesion: aSesion(existente) }
    if (await entregaDelAlumno(c, params.parcialId, yo)) throw new HttpError(409, 'Este parcial ya fue entregado.', { codigo: 'entregado' })
    const ahora = Date.now()
    if (estadoTurno(aTurno(turno), ahora) !== 'en-curso') {
      throw new HttpError(409, 'El turno no está en curso: no se puede abrir el parcial.', { codigo: 'fuera-de-turno' })
    }
    const { rows: [doc] } = await c.query('select duracion from documentos where id = $1', [params.parcialId])
    const fin = turnoFin(aTurno(turno)).getTime()
    const duracion = getDuracion(doc)
    const deadline = duracion == null ? fin : Math.min(ahora + duracion * 60_000, fin)
    const { rows } = await c.query(
      `insert into sesiones_examen (turno_id, alumno, parcial_id, apertura, deadline, ultimo_latido)
       values ($1, $2, $3, $4, $5, $4) on conflict do nothing returning *`,
      [turno.id, yo, params.parcialId, new Date(ahora), new Date(deadline)]
    )
    return { sesion: aSesion(rows[0] ?? (await sesionDelAlumno(c, params.parcialId, yo))) }
  })
)

// Se descartan los guardados que llegan fuera de orden (seq menor o igual al guardado) y los que llegan
// después de la hora límite más la tolerancia.
ruta('PUT', '/api/examen/:parcialId/respuestas', 'alumno', async ({ params, body, sesion }) => {
  const yo = sesion.username
  if (!esObjeto(body.respuestas) || !Number.isSafeInteger(body.seq) || body.seq < 1) {
    throw new HttpError(400, 'Las respuestas no son válidas.')
  }
  const ahora = new Date()
  const { rows } = await query(
    `update sesiones_examen set respuestas = $3, seq = $4, ultimo_guardado = $5, ultimo_latido = $5, pendientes = false
     where parcial_id = $1 and alumno = $2 and estado = 'en-curso' and seq < $4 and deadline >= $6
     returning seq`,
    [params.parcialId, yo, JSON.stringify(body.respuestas), body.seq, ahora, new Date(ahora.getTime() - TOLERANCIA_MS)]
  )
  if (rows[0]) return { seq: Number(rows[0].seq) }
  const s = await sesionDelAlumno({ query }, params.parcialId, yo)
  if (!s) throw new HttpError(404, 'No empezaste este parcial.')
  if (s.estado !== 'en-curso') throw new HttpError(409, 'El parcial ya fue entregado.', { codigo: 'entregado' })
  if (s.deadline.getTime() < ahora.getTime() - TOLERANCIA_MS) throw new HttpError(409, 'Se terminó el tiempo.', { codigo: 'vencido' })
  return { seq: Number(s.seq) }
})

ruta('POST', '/api/examen/:parcialId/latido', 'alumno', async ({ params, body, sesion }) => {
  const { rows } = await query(
    `update sesiones_examen set ultimo_latido = now(), pendientes = $3
     where parcial_id = $1 and alumno = $2 and estado = 'en-curso' returning *`,
    [params.parcialId, sesion.username, Boolean(body.pendientes)]
  )
  const s = rows[0] ?? (await sesionDelAlumno({ query }, params.parcialId, sesion.username))
  if (!s) throw new HttpError(404, 'No empezaste este parcial.')
  return { estado: s.estado, seq: Number(s.seq), deadline: s.deadline.toISOString() }
})

// Entrega del alumno (manual o automática al llegar a cero). Si llega tarde, se entrega lo último guardado.
// Es idempotente: si ya estaba entregado, devuelve esa entrega.
ruta('POST', '/api/examen/:parcialId/entregar', 'alumno', async ({ params, body, sesion }) =>
  tx(async (c) => {
    const yo = sesion.username
    const s = await sesionDelAlumno(c, params.parcialId, yo, { bloquear: true })
    if (!s) throw new HttpError(404, 'No empezaste este parcial.')
    if (s.estado === 'en-curso') {
      const ahora = Date.now()
      const enTiempo = ahora <= s.deadline.getTime() + TOLERANCIA_MS
      const nuevas = enTiempo && esObjeto(body.respuestas) && Number.isSafeInteger(body.seq) && body.seq >= Number(s.seq)
      const respuestas = nuevas ? body.respuestas : s.respuestas
      await crearEntrega(c, s, {
        respuestas,
        porTiempo: enTiempo && Boolean(body.automatico),
        porSistema: !enTiempo,
        fechaEntrega: new Date(Math.min(ahora, s.deadline.getTime())),
      })
      await c.query(
        'update sesiones_examen set estado = $3, respuestas = $4, seq = greatest(seq, $5) where parcial_id = $1 and alumno = $2',
        [params.parcialId, yo, enTiempo ? 'entregado' : 'entregado-sistema', JSON.stringify(respuestas), nuevas ? body.seq : 0]
      )
    }
    return { entrega: await entregaDelAlumno(c, params.parcialId, yo) }
  })
)
