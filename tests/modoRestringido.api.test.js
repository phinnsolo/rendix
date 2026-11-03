// Modo restringido y trazabilidad (Sprint 4): pruebas de la API contra una base PostgreSQL real (PGlite).
//   npm test
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crearEntorno, nuevoId } from './helpers/entorno.js'

let e

before(async () => {
  e = await crearEntorno()
})
after(async () => {
  await e?.cerrar()
})

const comenzar = (parcialId, token, body = { aceptoReglas: true, pantallaCompleta: true }) =>
  e.api('POST', `/api/examen/${parcialId}/comenzar`, { token, body })
const guardar = (parcialId, token, respuestas, seq) => e.api('PUT', `/api/examen/${parcialId}/respuestas`, { token, body: { respuestas, seq } })
const incidente = (parcialId, token, causa, extra = {}) =>
  e.api('POST', `/api/examen/${parcialId}/incidente`, { token, body: { eventoId: nuevoId(), causa, fechaCliente: Date.now(), ...extra } })
const salir = (parcialId, token, extra = {}) => e.api('POST', `/api/examen/${parcialId}/salir`, { token, body: { eventoId: nuevoId(), ...extra } })
const entregarExamen = (parcialId, token, extra = {}) => e.api('POST', `/api/examen/${parcialId}/entregar`, { token, body: extra })
const reanudar = (turnoId, alumno, token = e.tokens.profesor1, eventoId = nuevoId()) =>
  e.api('POST', `/api/turnos/${turnoId}/alumnos/${alumno}/reanudar`, { token, body: { eventoId } })
const reingresar = (parcialId, token) => e.api('POST', `/api/examen/${parcialId}/reingresar`, { token, body: {} })
const detalle = (turnoId, alumno, token = e.tokens.profesor1) => e.api('GET', `/api/turnos/${turnoId}/alumnos/${alumno}/eventos`, { token })
const estadoEnMonitoreo = async (turnoId, alumno) => {
  const { body } = await e.api('GET', '/api/monitoreo', { token: e.tokens.profesor1 })
  return body.turnos.find((t) => t.id === turnoId)?.alumnos.find((a) => a.username === alumno)
}
const tipos = async (turnoId, alumno) => (await detalle(turnoId, alumno)).body.eventos.map((ev) => ev.tipo)
const cuantos = (lista, tipo) => lista.filter((t) => t === tipo).length

// Atrasa el último latido de la sesión, como si el dispositivo hubiera dejado de responder hace `ms`.
const atrasarLatido = (parcialId, alumno, ms) =>
  e.pool.query(`update sesiones_examen set ultimo_latido = now() - ($3 || ' milliseconds')::interval where parcial_id = $1 and alumno = $2`, [parcialId, alumno, String(ms)])

describe('inicio del examen (US1)', () => {
  test('1. el alumno inicia correctamente aceptando reglas y en pantalla completa', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    const { status, body } = await comenzar(parcialId, e.tokens.alumno1)
    assert.equal(status, 200)
    assert.equal(body.sesion.estado, 'en-curso')
    assert.ok(body.sesion.reglasAceptadas)
    assert.deepEqual(await tipos(turnoId, 'alumno1'), ['EXAM_STARTED', 'RESTRICTED_MODE_ACCEPTED', 'FULLSCREEN_ENTERED'])
    const fila = await estadoEnMonitoreo(turnoId, 'alumno1')
    assert.equal(fila.sesion.estado, 'en-curso')
  })

  test('2. no puede empezar ni responder sin aceptar las reglas o sin pantalla completa', async () => {
    const { parcialId } = await e.parcialEnCurso()
    const sinReglas = await comenzar(parcialId, e.tokens.alumno1, { pantallaCompleta: true })
    assert.equal(sinReglas.status, 400)
    assert.equal(sinReglas.body.codigo, 'reglas')
    const sinPantalla = await comenzar(parcialId, e.tokens.alumno1, { aceptoReglas: true })
    assert.equal(sinPantalla.status, 400)
    assert.equal(sinPantalla.body.codigo, 'pantalla-completa')
    // Sin sesión no hay dónde guardar respuestas.
    const respuesta = await guardar(parcialId, e.tokens.alumno1, { b1: '4' }, 1)
    assert.equal(respuesta.status, 404)
  })

  test('comenzar es idempotente: dos pedidos crean una sola sesión y un solo juego de eventos', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    const [a, b] = await Promise.all([comenzar(parcialId, e.tokens.alumno1), comenzar(parcialId, e.tokens.alumno1)])
    assert.equal(a.body.sesion.id, b.body.sesion.id)
    assert.equal(cuantos(await tipos(turnoId, 'alumno1'), 'EXAM_STARTED'), 1)
  })
})

describe('incidentes (US2 / US4)', () => {
  test('3. salida de pantalla completa → Incidente, con el examen bloqueado', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    const { status, body } = await incidente(parcialId, e.tokens.alumno1, 'FULLSCREEN_EXIT')
    assert.equal(status, 200)
    assert.equal(body.estado, 'incidente')
    assert.ok(body.restanteMs > 0)
    const bloqueado = await guardar(parcialId, e.tokens.alumno1, { b1: 'tarde' }, 50)
    assert.equal(bloqueado.status, 409)
    assert.equal(bloqueado.body.codigo, 'incidente')
    const entrega = await entregarExamen(parcialId, e.tokens.alumno1, { respuestas: {}, seq: 99 })
    assert.equal(entrega.status, 409)
    const ev = await tipos(turnoId, 'alumno1')
    assert.ok(ev.includes('FULLSCREEN_EXIT'))
    assert.ok(ev.includes('INCIDENT'))
  })

  test('4. pestaña oculta (visibilitychange) → Incidente', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    const { body } = await incidente(parcialId, e.tokens.alumno1, 'VISIBILITY_HIDDEN')
    assert.equal(body.estado, 'incidente')
    const fila = await estadoEnMonitoreo(turnoId, 'alumno1')
    assert.equal(fila.sesion.estado, 'incidente')
    assert.equal(fila.sesion.incidenteCausa, 'VISIBILITY_HIDDEN')
  })

  test('5 / 20. varias señales simultáneas y reintentos generan un único Incidente', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    const eventoId = nuevoId()
    const pedidos = [
      incidente(parcialId, e.tokens.alumno1, 'FULLSCREEN_EXIT', { eventoId, senales: [{ tipo: 'VISIBILITY_HIDDEN' }, { tipo: 'WINDOW_BLUR' }] }),
      incidente(parcialId, e.tokens.alumno1, 'FULLSCREEN_EXIT', { eventoId }), // reintento del mismo evento
      incidente(parcialId, e.tokens.alumno1, 'VISIBILITY_HIDDEN'),
      incidente(parcialId, e.tokens.alumno1, 'WINDOW_BLUR'),
    ]
    const respuestas = await Promise.all(pedidos)
    assert.ok(respuestas.every((r) => r.status === 200 && r.body.estado === 'incidente'))
    const ev = await tipos(turnoId, 'alumno1')
    assert.equal(cuantos(ev, 'INCIDENT'), 1)
    // Las señales técnicas del mismo abandono quedan anotadas una vez cada una.
    assert.equal(cuantos(ev, 'FULLSCREEN_EXIT'), 1)
    assert.equal(cuantos(ev, 'VISIBILITY_HIDDEN'), 1)
    assert.equal(cuantos(ev, 'WINDOW_BLUR'), 1)
  })

  test('9. heartbeat vencido → Incidente (HEARTBEAT_TIMEOUT) y el panel lo ve en la consulta siguiente', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    await atrasarLatido(parcialId, 'alumno1', 5000)
    assert.equal((await estadoEnMonitoreo(turnoId, 'alumno1')).sesion.estado, 'en-curso') // todavía dentro del umbral
    await atrasarLatido(parcialId, 'alumno1', 9000)
    const fila = await estadoEnMonitoreo(turnoId, 'alumno1')
    assert.equal(fila.sesion.estado, 'incidente')
    assert.equal(fila.sesion.incidenteCausa, 'HEARTBEAT_TIMEOUT')
    // El tiempo que quedaba se cuenta desde el último latido, no desde que se detectó.
    assert.ok(fila.sesion.restanteMs > 0)
    const ev = await tipos(turnoId, 'alumno1')
    assert.equal(cuantos(ev, 'HEARTBEAT_TIMEOUT'), 1)
    assert.equal(cuantos(ev, 'INCIDENT'), 1)
    // Un latido que llega tarde no revive la sesión.
    const { body } = await e.api('POST', `/api/examen/${parcialId}/latido`, { token: e.tokens.alumno1, body: {} })
    assert.equal(body.estado, 'incidente')
  })

  test('un latido que llega después del umbral (sin que nadie haya consultado) tampoco revive la sesión', async () => {
    const { parcialId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    await atrasarLatido(parcialId, 'alumno1', 9000)
    const { body } = await e.api('POST', `/api/examen/${parcialId}/latido`, { token: e.tokens.alumno1, body: {} })
    assert.equal(body.estado, 'incidente')
    const guardado = await guardar(parcialId, e.tokens.alumno1, { b1: 'x' }, 5)
    assert.equal(guardado.body.codigo, 'incidente')
  })

  test('evento diferido (cola sin conexión) se registra como reconexión sin duplicar el incidente', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    await atrasarLatido(parcialId, 'alumno1', 9000)
    const { body } = await incidente(parcialId, e.tokens.alumno1, 'FULLSCREEN_EXIT', { diferido: true })
    assert.equal(body.estado, 'incidente')
    const ev = await tipos(turnoId, 'alumno1')
    assert.equal(cuantos(ev, 'INCIDENT'), 1)
    assert.equal(cuantos(ev, 'RECONNECTED'), 1)
  })
})

describe('SALIR y entrega normal (US3)', () => {
  test('6. SALIR → Salió y se entregó, con las respuestas del mismo pedido', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    await guardar(parcialId, e.tokens.alumno1, { b1: '4' }, 1)
    const { status, body } = await salir(parcialId, e.tokens.alumno1, { respuestas: { b1: '4', b2: 'porque sí' }, seq: 2 })
    assert.equal(status, 200)
    assert.equal(body.estado, 'salio-entrego')
    assert.equal(body.entrega.salidaVoluntaria, true)
    assert.deepEqual(body.entrega.respuestas, { b1: '4', b2: 'porque sí' })
    assert.ok(body.entrega.fechaEntrega)
    const fila = await estadoEnMonitoreo(turnoId, 'alumno1')
    assert.equal(fila.entrega.salidaVoluntaria, true)
    assert.deepEqual((await tipos(turnoId, 'alumno1')).slice(-1), ['VOLUNTARY_EXIT'])
  })

  test('7. la salida de pantalla completa provocada por SALIR no genera Incidente', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    // El cliente sale de pantalla completa recién cuando SALIR se confirmó; si la señal llega igual, no cambia nada.
    await salir(parcialId, e.tokens.alumno1)
    const despues = await incidente(parcialId, e.tokens.alumno1, 'FULLSCREEN_EXIT')
    assert.equal(despues.body.estado, 'salio-entrego')
    const ev = await tipos(turnoId, 'alumno1')
    assert.equal(cuantos(ev, 'INCIDENT'), 0)
    assert.equal(cuantos(ev, 'FULLSCREEN_EXIT'), 0)
  })

  test('FLUJO 5. SALIR y fullscreenchange casi simultáneos: gana SALIR y no hay Incidente', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    const [s, i] = await Promise.all([salir(parcialId, e.tokens.alumno1), incidente(parcialId, e.tokens.alumno1, 'FULLSCREEN_EXIT')])
    assert.equal(s.status, 200)
    assert.equal(i.body.estado, 'salio-entrego')
    assert.equal(cuantos(await tipos(turnoId, 'alumno1'), 'INCIDENT'), 0)
  })

  test('20. SALIR con doble click / reintento no genera dos entregas', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    const eventoId = nuevoId()
    const [a, b] = await Promise.all([salir(parcialId, e.tokens.alumno1, { eventoId }), salir(parcialId, e.tokens.alumno1, { eventoId })])
    assert.equal(a.status, 200)
    assert.equal(b.status, 200)
    assert.equal(a.body.entrega.id, b.body.entrega.id)
    const { rows } = await e.pool.query('select count(*)::int as n from entregas where parcial_id = $1 and alumno = $2', [parcialId, 'alumno1'])
    assert.equal(rows[0].n, 1)
    assert.equal(cuantos(await tipos(turnoId, 'alumno1'), 'VOLUNTARY_EXIT'), 1)
  })

  test('8. entrega normal → Entregado (NORMAL_SUBMISSION), distinta de SALIR', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    const [a, b] = await Promise.all([
      entregarExamen(parcialId, e.tokens.alumno1, { respuestas: { b1: '4' }, seq: 1 }),
      entregarExamen(parcialId, e.tokens.alumno1, { respuestas: { b1: '4' }, seq: 1 }),
    ])
    assert.equal(a.body.entrega.id, b.body.entrega.id)
    assert.equal(a.body.entrega.salidaVoluntaria, false)
    const fila = await estadoEnMonitoreo(turnoId, 'alumno1')
    assert.equal(fila.sesion.estado, 'entregado')
    const ev = await tipos(turnoId, 'alumno1')
    assert.equal(cuantos(ev, 'NORMAL_SUBMISSION'), 1)
    // Después de entregar, una señal de salida no crea incidente.
    const tarde = await incidente(parcialId, e.tokens.alumno1, 'FULLSCREEN_EXIT')
    assert.equal(tarde.body.estado, 'entregado')
  })
})

describe('reanudación (US5)', () => {
  test('10. el alumno no puede reanudarse (ni con el endpoint del profesor)', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    await incidente(parcialId, e.tokens.alumno1, 'FULLSCREEN_EXIT')
    const { status } = await reanudar(turnoId, 'alumno1', e.tokens.alumno1)
    assert.equal(status, 403)
    // Reingresar sin que el profesor reanude no sirve.
    const reingreso = await reingresar(parcialId, e.tokens.alumno1)
    assert.equal(reingreso.status, 409)
    const estado = await e.api('GET', `/api/examen/${parcialId}/estado`, { token: e.tokens.alumno1 })
    assert.equal(estado.body.estado, 'incidente')
  })

  test('11 / 14 / 15 / 16. el profesor reanuda: respuestas y tiempo restante se conservan', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    await guardar(parcialId, e.tokens.alumno1, { b1: '4' }, 1)
    // El incidente llega con el último cambio todavía sin guardar (flush inmediato).
    const inc = await incidente(parcialId, e.tokens.alumno1, 'VISIBILITY_HIDDEN', { respuestas: { b1: '4', b2: 'casi' }, seq: 2 })
    const restante = inc.body.restanteMs
    let examen = (await e.api('GET', `/api/examen/${parcialId}`, { token: e.tokens.alumno1 })).body
    assert.deepEqual(examen.sesion.respuestas, { b1: '4', b2: 'casi' }) // 14

    // Pasa un rato antes de que el profesor reanude: el tiempo del alumno está detenido.
    await new Promise((r) => setTimeout(r, 300))
    const r = await reanudar(turnoId, 'alumno1', e.tokens.profesor1)
    assert.equal(r.status, 200)
    assert.equal(r.body.estado, 'en-curso')
    assert.equal(r.body.reingresoPendiente, true)
    // Mientras no vuelve a pantalla completa no puede responder.
    assert.equal((await guardar(parcialId, e.tokens.alumno1, { b1: '5' }, 3)).body.codigo, 'reingreso')

    const antes = Date.now()
    const re = await reingresar(parcialId, e.tokens.alumno1)
    assert.equal(re.status, 200)
    const nuevoRestante = Date.parse(re.body.sesion.deadline) - antes
    assert.ok(Math.abs(nuevoRestante - restante) < 1500, `restante ${restante} vs ${nuevoRestante}`) // 16
    assert.deepEqual(re.body.sesion.respuestas, { b1: '4', b2: 'casi' }) // 15
    assert.equal(re.body.sesion.reanudaciones, 1)

    examen = (await e.api('GET', `/api/examen/${parcialId}`, { token: e.tokens.alumno1 })).body
    assert.equal(examen.sesion.estado, 'en-curso')
    assert.equal((await guardar(parcialId, e.tokens.alumno1, { b1: '4', b2: 'listo' }, 3)).status, 200)

    const d = (await detalle(turnoId, 'alumno1')).body
    const ev = d.eventos.map((x) => x.tipo)
    // La trazabilidad conserva el incidente anterior y anota quién reanudó.
    assert.deepEqual(ev.filter((t) => ['INCIDENT', 'RESUMED_BY_TEACHER', 'FULLSCREEN_ENTERED'].includes(t)),
      ['FULLSCREEN_ENTERED', 'INCIDENT', 'RESUMED_BY_TEACHER', 'FULLSCREEN_ENTERED'])
    const reanudado = d.eventos.find((x) => x.tipo === 'RESUMED_BY_TEACHER')
    assert.equal(reanudado.actor, 'profesor1')
    assert.equal(reanudado.actorNombre, 'Prof. Juan Pérez')
    assert.equal((await estadoEnMonitoreo(turnoId, 'alumno1')).sesion.estado, 'en-curso')
  })

  test('reanudar dos veces el mismo pedido no duplica la reanudación', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    await incidente(parcialId, e.tokens.alumno1, 'FULLSCREEN_EXIT')
    const eventoId = nuevoId()
    const [a, b] = await Promise.all([reanudar(turnoId, 'alumno1', e.tokens.profesor1, eventoId), reanudar(turnoId, 'alumno1', e.tokens.profesor1, eventoId)])
    assert.equal(a.status, 200)
    assert.equal(b.status, 200)
    assert.equal(cuantos(await tipos(turnoId, 'alumno1'), 'RESUMED_BY_TEACHER'), 1)
    // Un pedido distinto sobre un examen ya reanudado se rechaza.
    assert.equal((await reanudar(turnoId, 'alumno1')).status, 409)
  })

  test('12. el profesor no puede reanudar un examen que salió con SALIR', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    await salir(parcialId, e.tokens.alumno1)
    const { status, body } = await reanudar(turnoId, 'alumno1')
    assert.equal(status, 409)
    assert.equal(body.codigo, 'no-incidente')
  })

  test('13. el profesor no puede reanudar un examen entregado ni uno en curso', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    assert.equal((await reanudar(turnoId, 'alumno1')).status, 409) // en curso
    await entregarExamen(parcialId, e.tokens.alumno1, {})
    assert.equal((await reanudar(turnoId, 'alumno1')).status, 409) // entregado
  })

  test('otro profesor no puede ver ni reanudar exámenes ajenos', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    await incidente(parcialId, e.tokens.alumno1, 'FULLSCREEN_EXIT')
    assert.equal((await reanudar(turnoId, 'alumno1', e.tokens.profesor2)).status, 404)
    assert.equal((await detalle(turnoId, 'alumno1', e.tokens.profesor2)).status, 404)
    const { body } = await e.api('GET', '/api/monitoreo', { token: e.tokens.profesor2 })
    assert.equal(body.turnos.length, 0)
  })
})

describe('trazabilidad (eventos append-only)', () => {
  test('17. los eventos quedan registrados con hora del servidor', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    // Una hora del dispositivo falsa no cambia la hora oficial.
    await incidente(parcialId, e.tokens.alumno1, 'FULLSCREEN_EXIT', { fechaCliente: Date.now() - 3_600_000 })
    const { body } = await detalle(turnoId, 'alumno1')
    const inc = body.eventos.find((x) => x.tipo === 'INCIDENT')
    assert.ok(Math.abs(Date.parse(inc.fechaServidor) - Date.now()) < 5000)
    assert.ok(Math.abs(Date.parse(inc.fechaCliente) - (Date.now() - 3_600_000)) < 5000)
    assert.equal(inc.metadata.causa, 'FULLSCREEN_EXIT')
  })

  test('18. nadie puede modificar ni borrar eventos (ni por la API ni en la base)', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    const { body } = await detalle(turnoId, 'alumno1')
    const id = body.eventos[0].id
    for (const metodo of ['PUT', 'DELETE']) {
      const r = await e.api(metodo, `/api/turnos/${turnoId}/alumnos/alumno1/eventos`, { token: e.tokens.alumno1 })
      assert.ok([403, 404, 405].includes(r.status))
    }
    // Directo en la base, como lo haría cualquier acceso que no pase por la API.
    await assert.rejects(e.db.query(`update eventos_seguridad set tipo = 'INCIDENT' where id = '${id}'`), /no se pueden modificar/)
    await assert.rejects(e.db.query(`delete from eventos_seguridad where id = '${id}'`), /no se pueden modificar/)
    assert.equal((await detalle(turnoId, 'alumno1')).body.eventos.length, 3)
  })

  test('el alumno no puede tocar la sesión de otro: todo sale del token', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    // alumno2 manda un incidente "para alumno1": se aplica a su propia sesión, que no existe.
    const r = await e.api('POST', `/api/examen/${parcialId}/incidente`, {
      token: e.tokens.alumno2, body: { eventoId: nuevoId(), causa: 'FULLSCREEN_EXIT', alumno: 'alumno1', sesionId: 'x' },
    })
    assert.equal(r.status, 404)
    assert.equal((await estadoEnMonitoreo(turnoId, 'alumno1')).sesion.estado, 'en-curso')
    // Y no puede ver el detalle del profesor.
    assert.equal((await detalle(turnoId, 'alumno1', e.tokens.alumno2)).status, 403)
  })

  test('borrar el parcial borra en cascada sus eventos (la única forma de que desaparezcan)', async () => {
    const { parcialId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    const r = await e.api('DELETE', `/api/documentos/${parcialId}`, { token: e.tokens.profesor1 })
    assert.equal(r.status, 200)
    const { rows } = await e.pool.query('select count(*)::int as n from eventos_seguridad where parcial_id = $1', [parcialId])
    assert.equal(rows[0].n, 0)
  })
})

describe('panel del profesor (US6)', () => {
  test('19. el cambio de estado se ve en la consulta inmediatamente posterior (polling cada 2 s)', async () => {
    const { SEGUIMIENTO_MS } = await import('../src/seguimiento.js')
    assert.ok(SEGUIMIENTO_MS <= 2000)
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno2)
    assert.equal((await estadoEnMonitoreo(turnoId, 'alumno2')).sesion.estado, 'en-curso')
    const t0 = Date.now()
    await incidente(parcialId, e.tokens.alumno2, 'FULLSCREEN_EXIT')
    assert.equal((await estadoEnMonitoreo(turnoId, 'alumno2')).sesion.estado, 'incidente')
    assert.ok(Date.now() - t0 < 2000)
  })

  test('el monitoreo sigue mostrando un turno terminado mientras tenga un Incidente', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno1)
    await incidente(parcialId, e.tokens.alumno1, 'FULLSCREEN_EXIT')
    await e.pool.query("update turnos set fin = now() - interval '1 minute' where id = $1", [turnoId])
    assert.equal((await estadoEnMonitoreo(turnoId, 'alumno1')).sesion.estado, 'incidente')
  })

  test('autoguardado: cambios fuera de orden se descartan y los nuevos se guardan', async () => {
    const { parcialId } = await e.parcialEnCurso()
    await comenzar(parcialId, e.tokens.alumno3)
    assert.equal((await guardar(parcialId, e.tokens.alumno3, { b1: 'dos' }, 2)).body.seq, 2)
    assert.equal((await guardar(parcialId, e.tokens.alumno3, { b1: 'uno' }, 1)).body.seq, 2)
    const { body } = await e.api('GET', `/api/examen/${parcialId}`, { token: e.tokens.alumno3 })
    assert.deepEqual(body.sesion.respuestas, { b1: 'dos' })
  })
})
