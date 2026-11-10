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
