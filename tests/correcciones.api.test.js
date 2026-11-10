// Correcciones de bugs reportados por QA: pruebas de la API contra una base PostgreSQL real (PGlite).
//   npm test
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crearEntorno } from './helpers/entorno.js'

let e

before(async () => {
  e = await crearEntorno()
})
after(async () => {
  await e?.cerrar()
})

const comenzar = (parcialId, token) =>
  e.api('POST', `/api/examen/${parcialId}/comenzar`, { token, body: { aceptoReglas: true, pantallaCompleta: true } })

// Body de PUT /api/documentos/:id con los valores guardados del parcial, más los cambios pedidos.
async function editar(parcialId, cambios = {}) {
  const { rows: [d] } = await e.pool.query('select * from documentos where id = $1', [parcialId])
  const body = { claseId: d.clase_id, titulo: d.titulo, tema: d.tema, duracion: d.duracion, bloques: d.bloques, horarios: [], ...cambios }
  return e.api('PUT', `/api/documentos/${parcialId}`, { token: e.tokens.profesor1, body })
}

describe('BUG-011: el contenido del parcial queda fijo cuando un alumno empezó', () => {
  test('sin alumnos que hayan empezado, se puede cambiar el tema', async () => {
    const { parcialId } = await e.parcialEnCurso()
    const { status, body } = await editar(parcialId, { tema: 'Tema 2' })
    assert.equal(status, 200, JSON.stringify(body))
    assert.equal(body.documento.tema, 'Tema 2')
  })

  test('con un alumno que empezó, no se puede cambiar el tema ni las consignas', async () => {
    const { parcialId } = await e.parcialEnCurso()
    assert.equal((await comenzar(parcialId, e.tokens.alumno1)).status, 200)

    const tema = await editar(parcialId, { tema: 'Tema 2' })
    assert.equal(tema.status, 409)
    const bloques = await editar(parcialId, { bloques: [{ id: 'b1', tipo: 'texto', consigna: 'Otra consigna', contenido: '' }] })
    assert.equal(bloques.status, 409)

    const { rows: [d] } = await e.pool.query('select tema, bloques from documentos where id = $1', [parcialId])
    assert.equal(d.tema, 'Tema 1')
    assert.equal(d.bloques.length, 2)
  })

  test('con un alumno que empezó, se puede cambiar el título si el contenido no cambia', async () => {
    const { parcialId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    const { status, body } = await editar(parcialId, { titulo: 'Título corregido' })
    assert.equal(status, 200, JSON.stringify(body))
    assert.equal(body.documento.titulo, 'Título corregido')
  })
})

describe('BUG-019: el servidor decide si una entrega fue por tiempo', () => {
  test('una entrega "automática" con tiempo de sobra cuenta como entrega normal', async () => {
    const { parcialId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    const { status } = await e.api('POST', `/api/examen/${parcialId}/entregar`, { token: e.tokens.alumno1, body: { automatico: true } })
    assert.equal(status, 200)
    const { rows: [entrega] } = await e.pool.query('select enviado_por_tiempo from entregas where parcial_id = $1 and alumno = $2', [parcialId, 'alumno1'])
    assert.equal(entrega.enviado_por_tiempo, false)
    const { rows } = await e.pool.query(
      `select tipo from eventos_seguridad ev join sesiones_examen s on s.id = ev.sesion_id where s.parcial_id = $1 and s.alumno = $2`,
      [parcialId, 'alumno1']
    )
    assert.ok(rows.some((r) => r.tipo === 'NORMAL_SUBMISSION'))
    assert.ok(!rows.some((r) => r.tipo === 'TIME_EXPIRED'))
  })

  test('una entrega automática al llegar a cero sigue contando como por tiempo', async () => {
    const { parcialId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    await e.pool.query(`update sesiones_examen set deadline = now() where parcial_id = $1 and alumno = 'alumno1'`, [parcialId])
    await e.api('POST', `/api/examen/${parcialId}/entregar`, { token: e.tokens.alumno1, body: { automatico: true } })
    const { rows: [entrega] } = await e.pool.query('select enviado_por_tiempo from entregas where parcial_id = $1 and alumno = $2', [parcialId, 'alumno1'])
    assert.equal(entrega.enviado_por_tiempo, true)
  })
})

describe('registro: BUG-007 (contraseña de 8) y BUG-013 (nombre de hasta 30)', () => {
  let n = 0
  const registrar = (cambios = {}) => {
    n += 1
    return e.api('POST', '/api/registro', {
      body: { nombre: 'Ana Gómez', usuario: `nuevo${n}`, email: `nuevo${n}@mail.com`, password: '12345678', ...cambios },
    })
  }

  test('rechaza una contraseña de 7 caracteres y acepta una de 8', async () => {
    const corta = await registrar({ password: '1234567' })
    assert.equal(corta.status, 400)
    assert.match(corta.body.errores.password, /8 caracteres/)
    assert.equal((await registrar({ password: '12345678' })).status, 200)
  })

  test('rechaza un nombre de 31 caracteres y acepta uno de 30', async () => {
    const largo = await registrar({ nombre: 'A'.repeat(31) })
    assert.equal(largo.status, 400)
    assert.match(largo.body.errores.nombre, /30 caracteres/)
    assert.equal((await registrar({ nombre: 'A'.repeat(30) })).status, 200)
  })
})

describe('BUG-006 / BUG-012: el nombre de la clase no puede repetirse', () => {
  const clase = (nombre) => ({ nombre, dia: 'martes', turno: 'tarde', profesores: ['profesor2'], alumnos: ['alumno1'] })
  const crear = (nombre) => e.api('POST', '/api/clases', { token: e.tokens.dev1, body: clase(nombre) })

  test('rechaza el mismo nombre exacto y con otras mayúsculas o espacios', async () => {
    // 'Matemáticas' ya existe (clase1 del entorno).
    for (const nombre of ['Matemáticas', 'matemáticas', '  MATEMÁTICAS ']) {
      const { status, body } = await crear(nombre)
      assert.equal(status, 400, nombre)
      assert.equal(body.errores.nombre, 'El nombre de la clase no puede repetirse.')
    }
    const { rows } = await e.pool.query("select count(*)::int as n from clases where lower(trim(nombre)) = 'matemáticas'")
    assert.equal(rows[0].n, 1)
  })

  test('al editar, no se puede usar el nombre de otra clase, pero sí conservar el propio', async () => {
    const { body } = await crear('Física')
    const id = body.clase.id
    const ajeno = await e.api('PUT', `/api/clases/${id}`, { token: e.tokens.dev1, body: clase('matemáticas') })
    assert.equal(ajeno.status, 400)
    const propio = await e.api('PUT', `/api/clases/${id}`, { token: e.tokens.dev1, body: clase('FÍSICA') })
    assert.equal(propio.status, 200, JSON.stringify(propio.body))
  })

  test('la base tampoco acepta nombres repetidos', async () => {
    await assert.rejects(
      e.db.query("insert into clases (id, nombre, dia, turno, profesores, alumnos) values ('x1', 'MATEMÁTICAS', 'lunes', 'manana', '{}', '{}')"),
      /unique|duplicate|único/i
    )
  })
})

describe('BUG-010 / BUG-018: consignas obligatorias', () => {
  // Parcial de profesor1 sin publicar, con un turno que todavía no empezó (dentro de 7 días, en el turno de la clase).
  async function borrador(bloques) {
    const fecha = new Date(Date.now() + 7 * 86_400_000)
    while (fecha.getUTCDay() !== 1) fecha.setUTCDate(fecha.getUTCDate() + 1) // la clase se dicta los lunes
    const id = `borrador-${Date.now()}-${Math.random()}`
    await e.pool.query(
      `insert into documentos (id, profesor, clase_id, titulo, tema, duracion, bloques) values ($1, 'profesor1', 'clase1', 'Borrador', 'Tema 1', 60, $2)`,
      [id, JSON.stringify(bloques)]
    )
    const fechaIso = fecha.toISOString().slice(0, 10)
    await e.pool.query(
      `insert into turnos (id, profesor, parcial_id, turno, fecha, hora_inicio, hora_fin, inicio, fin, alumnos)
       values ($1, 'profesor1', $2, 'manana', $3, '08:00', '09:00', $4, $5, '{alumno1}')`,
      [`turno-${id}`, id, fechaIso, `${fechaIso}T08:00:00-03:00`, `${fechaIso}T09:00:00-03:00`]
    )
    return id
  }

  test('BUG-010: no se guarda un apartado sin consigna', async () => {
    const { parcialId } = await e.parcialEnCurso()
    const { status, body } = await editar(parcialId, {
      titulo: 'Otro título',
      bloques: [{ id: 'b1', tipo: 'texto', consigna: '¿Cuánto es 2 + 2?', contenido: '' }, { id: 'b2', tipo: 'texto', consigna: '   ', contenido: '' }],
    })
    // El contenido no cambia el tema ni las consignas válidas: primero se valida la consigna vacía.
    assert.equal(status, 400)
    assert.match(body.error, /apartado 2 necesita una consigna/)
  })

  test('BUG-018: no se publica ni se toma un parcial sin consignas', async () => {
    const vacio = await borrador([])
    const publicar = await e.api('POST', `/api/documentos/${vacio}/publicar`, { token: e.tokens.profesor1 })
    assert.equal(publicar.status, 400)
    assert.match(publicar.body.error, /al menos una consigna/)
    const tomar = await e.api('POST', `/api/documentos/${vacio}/tomar-ahora`, { token: e.tokens.profesor1 })
    assert.equal(tomar.status, 400)
    const { rows: [d] } = await e.pool.query('select estado from documentos where id = $1', [vacio])
    assert.notEqual(d.estado, 'publicado')
  })

  test('BUG-018: con una consigna se publica', async () => {
    const id = await borrador([{ id: 'b1', tipo: 'texto', consigna: 'Una consigna', contenido: '' }])
    const { status, body } = await e.api('POST', `/api/documentos/${id}/publicar`, { token: e.tokens.profesor1 })
    assert.equal(status, 200, JSON.stringify(body))
  })
})
