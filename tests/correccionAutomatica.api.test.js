// Sprint final (RF11, RF12, RF13): corrección automática con agentes jueces, revisión docente, auditoría, publicación y
// consulta de resultados. Pruebas de la API contra una base PostgreSQL real (PGlite). El agente juez se reemplaza por un
// mock SOLO en estas pruebas (la aplicación usa server/juez.js, que llama a la API de Claude).
//   npm test
import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crearEntorno, nuevoId } from './helpers/entorno.js'
import { calcularNota, puntajePorCriterios, validarResultadoJuez, ResultadoInvalido } from '../src/correccion.js'
import { armarPedido } from '../server/juez.js'

let e
let corr

// Juez simulado: decide por la consigna. Guarda cada pedido para comprobar qué recibió.
const pedidos = []
let comportamiento = () => null
async function juezMock(entrada) {
  pedidos.push(entrada)
  const r = comportamiento(entrada, pedidos.filter((p) => p.block.id === entrada.block.id).length)
  if (r instanceof Error) throw r
  if (typeof r === 'function') return r()
  const salida = r ?? {
    criterios: entrada.criterios.map((c) => ({ id: c.id, nivel: 'cumple', justificacion: 'Ok' })),
    puntaje_sugerido: entrada.puntajeMax, feedback: `Muy bien (${entrada.block.id}).`, confianza: 0.95,
  }
  return validarResultadoJuez(salida, entrada)
}

before(async () => {
  e = await crearEntorno()
  corr = await import('../server/correccion.js')
  corr.configurarCorreccion({ juez: juezMock, automatica: false, esperasMs: [0, 0] })
})
after(async () => {
  await e?.cerrar()
})
beforeEach(async () => {
  // Cada prueba empieza con la cola vacía (lo que dejó la anterior se corrige con el juez por defecto).
  comportamiento = () => null
  await corr.procesarCola({ esperarReintentos: false })
  pedidos.length = 0
})

const C = (id, texto, peso) => ({ id, texto, peso })
const BLOQUES = [
  { id: 'q1', tipo: 'texto', consigna: 'Definí derivada.', contenido: '', puntaje: 4, criterios: [C('c1', 'Menciona el límite del cociente incremental', 3), C('c2', 'Da un ejemplo', 1)] },
  { id: 'q2', tipo: 'codigo', consigna: 'Escribí una función que sume dos números.', lenguaje: 'python', contenido: 'def suma(a, b):\n    pass', puntaje: 6, criterios: [C('c1', 'Devuelve a + b', 1)] },
  { id: 'q3', tipo: 'opcion-multiple', consigna: '¿2 + 2?', puntaje: 2, opciones: [{ id: 'o1', texto: '3', correcta: false }, { id: 'o2', texto: '4', correcta: true }] },
]

const comenzar = (parcialId, alumno) =>
  e.api('POST', `/api/examen/${parcialId}/comenzar`, { token: e.tokens[alumno], body: { aceptoReglas: true, pantallaCompleta: true } })

async function rendir(parcialId, alumno, respuestas) {
  assert.equal((await comenzar(parcialId, alumno)).status, 200)
  const g = await e.api('PUT', `/api/examen/${parcialId}/respuestas`, { token: e.tokens[alumno], body: { respuestas, seq: 1 } })
  assert.equal(g.status, 200, JSON.stringify(g.body))
  const t0 = performance.now()
  const r = await e.api('POST', `/api/examen/${parcialId}/entregar`, { token: e.tokens[alumno], body: {} })
  const ms = performance.now() - t0
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return { entrega: r.body.entrega, ms }
}

const RESPUESTAS_OK = { q1: 'Es el límite del cociente incremental. Ej: (x²)\' = 2x', q2: 'def suma(a, b):\n    return a + b', q3: 'o2' }

async function evaluaciones(entregaId) {
  const { rows } = await e.pool.query('select * from evaluaciones where entrega_id = $1 order by orden', [entregaId])
  return rows
}
async function entregaFila(entregaId) {
  return (await e.pool.query('select * from entregas where id = $1', [entregaId])).rows[0]
}
const revision = (entregaId) => e.api('GET', `/api/entregas/${entregaId}/revision`, { token: e.tokens.profesor1 })
const ajustar = (entregaId, bloqueId, body) => e.api('PUT', `/api/entregas/${entregaId}/evaluaciones/${bloqueId}`, { token: e.tokens.profesor1, body })
const publicar = (entregaId) => e.api('POST', `/api/entregas/${entregaId}/publicar`, { token: e.tokens.profesor1 })
const resultado = (entregaId, alumno) => e.api('GET', `/api/entregas/${entregaId}/resultado`, { token: e.tokens[alumno] })

describe('US1: encolado y evaluación automática', () => {
  test('1. al entregar se registra la entrega y se encola una evaluación por pregunta (≤ 2 s)', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega, ms } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    assert.ok(ms < 2000, `encolado en ${ms} ms`)
    const filas = await evaluaciones(entrega.id)
    assert.deepEqual(filas.map((f) => f.bloque_id), ['q1', 'q2', 'q3'])
    assert.deepEqual(filas.map((f) => f.estado), ['pendiente', 'pendiente', 'evaluada']) // multiple choice: determinístico
    const fila = await entregaFila(entrega.id)
    assert.equal(fila.estado_correccion, 'entregado')
    const { rows: [s] } = await e.pool.query('select estado from sesiones_examen where parcial_id = $1 and alumno = $2', [parcialId, 'alumno1'])
    assert.equal(s.estado, 'entregado')
    assert.equal(entrega.estadoCorreccion, 'entregado')
  })

  test('2 y 3. cada pregunta se corrige con un juez independiente, solo con datos de la pregunta', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    comportamiento = ({ block }) => block.id === 'q1'
      ? { criterios: [{ id: 'c1', nivel: 'cumple', justificacion: 'Sí' }, { id: 'c2', nivel: 'no-cumple', justificacion: 'No' }], puntaje_sugerido: 3, feedback: 'Falta el ejemplo.', confianza: 0.9 }
      : null
    const resumen = await corr.procesarCola()
    assert.equal(resumen.evaluada, 2)
    assert.equal(pedidos.length, 2) // q1 y q2: un juez cada una
    for (const p of pedidos) {
      assert.deepEqual(Object.keys(p).sort(), ['block', 'criterios', 'puntajeMax', 'respuesta'])
      const texto = JSON.stringify(p) + armarPedido(p)
      for (const dato of ['alumno1', 'Alumno Demo 1', entrega.id]) assert.ok(!texto.includes(dato), `el juez recibió "${dato}"`)
    }
    const [q1, q2, q3] = await evaluaciones(entrega.id)
    assert.equal(q1.estado, 'evaluada')
    assert.equal(Number(q1.puntaje_sugerido), 3) // 4 × 3/(3+1)
    assert.equal(q1.feedback_sugerido, 'Falta el ejemplo.')
    assert.equal(Number(q2.puntaje_final), 6)
    assert.equal(Number(q3.puntaje_final), 2)
    const fila = await entregaFila(entrega.id)
    assert.equal(fila.estado_correccion, 'evaluado')
    assert.equal(Number(fila.nota), 9.17) // (3 + 6 + 2) / 12 × 10
  })

  test('4. respuesta vacía: 0 puntos y "Requiere revisión", sin llamar al juez', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    // q1 vacía, q2 con el código inicial sin cambios, q3 sin elegir.
    const { entrega } = await rendir(parcialId, 'alumno1', { q1: '   ', q2: 'def suma(a, b):\n    pass' })
    const filas = await evaluaciones(entrega.id)
    for (const f of filas) {
      assert.equal(f.estado, 'evaluada')
      assert.equal(Number(f.puntaje_final), 0)
      assert.equal(f.respuesta_vacia, true)
      assert.equal(f.requiere_revision, true)
    }
    await corr.procesarCola()
    assert.equal(pedidos.length, 0)
    assert.equal((await entregaFila(entrega.id)).estado_correccion, 'evaluado')
  })

  test('5. límites de puntaje y formato del resultado del juez', () => {
    const base = { criterios: [C('c1', 'x', 1)], puntajeMax: 4 }
    const ok = { criterios: [{ id: 'c1', nivel: 'parcial', justificacion: '' }], puntaje_sugerido: 2, feedback: 'Bien', confianza: 0.5 }
    assert.equal(validarResultadoJuez(ok, base).puntaje, 2)
    const malos = [
      { ...ok, puntaje_sugerido: -1 },
      { ...ok, puntaje_sugerido: 4.5 },
      { ...ok, confianza: 1.2 },
      { ...ok, feedback: '' },
      { ...ok, feedback: 'x'.repeat(2001) },
      { ...ok, criterios: [] },
      { ...ok, criterios: [{ id: 'otro', nivel: 'cumple', justificacion: '' }] },
      { ...ok, criterios: [{ id: 'c1', nivel: 'excelente', justificacion: '' }] },
      'no es un objeto',
    ]
    for (const m of malos) assert.throws(() => validarResultadoJuez(m, base), ResultadoInvalido, JSON.stringify(m))
  })

  test('6. la nota respeta los pesos del profesor', () => {
    const criterios = [{ peso: 3, cumplimiento: 1 }, { peso: 1, cumplimiento: 0.5 }]
    assert.equal(puntajePorCriterios(8, criterios), 7) // 8 × 3.5/4
    assert.deepEqual(calcularNota([{ puntajeMax: 4, puntajeFinal: 3 }, { puntajeMax: 6, puntajeFinal: 6 }]), { total: 9, maximo: 10, nota: 9 })
    assert.equal(calcularNota([{ puntajeMax: 4, puntajeFinal: null }, { puntajeMax: 6, puntajeFinal: 6 }]).nota, null)
  })

  test('encolar dos veces (reintento de la entrega) no duplica evaluaciones', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    const otra = await e.api('POST', `/api/examen/${parcialId}/entregar`, { token: e.tokens.alumno1, body: {} })
    assert.equal(otra.status, 200)
    await e.pool.query('begin')
    await corr.encolarEntrega(e.pool, entrega.id)
    await e.pool.query('commit')
    assert.equal((await evaluaciones(entrega.id)).length, 3)
    await Promise.all([corr.procesarCola(), corr.procesarCola()])
    assert.equal(pedidos.length, 2) // q1 y q2 una sola vez cada una
  })
})

describe('US2: tolerancia a fallos y baja confianza', () => {
  test('7. un error del juez se reintenta (hasta 2 reintentos) y luego se evalúa', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    comportamiento = ({ block }, n) => (block.id === 'q1' && n <= 2 ? new Error(n === 1 ? 'timeout' : 'JSON inválido') : null)
    await corr.procesarCola()
    const [q1] = await evaluaciones(entrega.id)
    assert.equal(q1.estado, 'evaluada')
    assert.equal(q1.intentos, 3)
    assert.equal(pedidos.filter((p) => p.block.id === 'q1').length, 3)
  })

  test('8. fallas persistentes: Error y corrección manual; la respuesta y las demás preguntas siguen', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    // Respuesta fuera de rango del modelo: cuenta como resultado inválido.
    comportamiento = ({ block }) => (block.id === 'q1'
      ? { criterios: [{ id: 'c1', nivel: 'cumple', justificacion: '' }, { id: 'c2', nivel: 'cumple', justificacion: '' }], puntaje_sugerido: 99, feedback: 'x', confianza: 1 }
      : null)
    await corr.procesarCola()
    const [q1, q2] = await evaluaciones(entrega.id)
    assert.equal(pedidos.filter((p) => p.block.id === 'q1').length, 3) // 1 + 2 reintentos
    assert.equal(q1.estado, 'error')
    assert.equal(q1.requiere_revision, true)
    assert.equal(q1.puntaje_final, null)
    assert.match(q1.ultimo_error, /mayor que el máximo/)
    assert.equal(q2.estado, 'evaluada')
    const fila = await entregaFila(entrega.id)
    assert.equal(fila.estado_correccion, 'evaluado')
    assert.equal(fila.nota, null) // falta un puntaje definitivo
    assert.equal(fila.respuestas.q1, RESPUESTAS_OK.q1)
    const { body } = await revision(entrega.id)
    assert.equal(body.entrega.resumenCorreccion.errores, 1)
  })

  test('9. confianza menor al umbral del profesor: "Baja confianza" y alerta', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES, umbral: 0.8 })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    comportamiento = ({ block, criterios }) => (block.id === 'q2'
      ? { criterios: criterios.map((c) => ({ id: c.id, nivel: 'parcial', justificacion: '' })), puntaje_sugerido: 3, feedback: 'Dudoso', confianza: 0.6 }
      : null)
    await corr.procesarCola()
    const [q1, q2] = await evaluaciones(entrega.id)
    assert.equal(q1.baja_confianza, false)
    assert.equal(q2.baja_confianza, true)
    assert.equal(q2.requiere_revision, true)
    const { body } = await revision(entrega.id)
    assert.equal(body.entrega.resumenCorreccion.bajaConfianza, 1)
  })

  test('sin clave de la API, las preguntas quedan en cola sin gastar intentos', async () => {
    const { JuezSinConfigurar } = await import('../server/juez.js')
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    comportamiento = () => new JuezSinConfigurar('Falta ANTHROPIC_API_KEY')
    await corr.procesarCola({ esperarReintentos: false })
    const [q1] = await evaluaciones(entrega.id)
    assert.equal(q1.estado, 'pendiente')
    assert.equal(q1.intentos, 0)
    assert.match(q1.ultimo_error, /ANTHROPIC_API_KEY/)
  })

  test('el profesor puede volver a mandar a los jueces una pregunta en Error', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    comportamiento = ({ block }) => (block.id === 'q1' ? new Error('proveedor caído') : null)
    await corr.procesarCola()
    assert.equal((await evaluaciones(entrega.id))[0].estado, 'error')
    comportamiento = () => null
    const r = await e.api('POST', `/api/entregas/${entrega.id}/reevaluar`, { token: e.tokens.profesor1 })
    assert.equal(r.status, 200)
    await corr.procesarCola()
    assert.equal((await evaluaciones(entrega.id))[0].estado, 'evaluada')
  })

  test('20. con la corrección en curso, autoguardado, latido e incidentes de otros alumnos siguen < 1 s', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    assert.equal((await comenzar(parcialId, 'alumno2')).status, 200)
    // Jueces lentos y uno que falla: la cola corre en paralelo con el examen de alumno2.
    comportamiento = ({ block }) => () => new Promise((resolve, reject) => setTimeout(() => (block.id === 'q1' ? reject(new Error('caído')) : resolve(validarResultadoJuez({
      criterios: [{ id: 'c1', nivel: 'cumple', justificacion: '' }], puntaje_sugerido: 6, feedback: 'Ok', confianza: 0.9,
    }, { criterios: [C('c1', 'x', 1)], puntajeMax: 6 }))), 300))
    const cola = corr.procesarCola()
    const medir = async (fn) => {
      const t0 = performance.now()
      const r = await fn()
      return { r, ms: performance.now() - t0 }
    }
    const guardado = await medir(() => e.api('PUT', `/api/examen/${parcialId}/respuestas`, { token: e.tokens.alumno2, body: { respuestas: { q1: 'hola' }, seq: 1 } }))
    const latido = await medir(() => e.api('POST', `/api/examen/${parcialId}/latido`, { token: e.tokens.alumno2, body: {} }))
    const incidente = await medir(() => e.api('POST', `/api/examen/${parcialId}/incidente`, {
      token: e.tokens.alumno2, body: { causa: 'FULLSCREEN_EXIT', eventoId: nuevoId() },
    }))
    for (const { r, ms } of [guardado, latido, incidente]) {
      assert.equal(r.status, 200, JSON.stringify(r.body))
      assert.ok(ms < 1000, `${ms} ms`)
    }
    assert.equal(incidente.r.body.estado, 'incidente') // el modo restringido sigue registrando
    await cola
    const { rows: [s] } = await e.pool.query('select respuestas from sesiones_examen where parcial_id = $1 and alumno = $2', [parcialId, 'alumno2'])
    assert.equal(s.respuestas.q1, 'hola')
    assert.equal((await evaluaciones(entrega.id))[0].estado, 'error')
  })

  test('disparo automático: después de responder la entrega, los jueces corrigen solos', async () => {
    corr.configurarCorreccion({ automatica: true })
    try {
      const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
      const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
      for (let i = 0; i < 100 && (await entregaFila(entrega.id)).estado_correccion !== 'evaluado'; i++) await new Promise((r) => setTimeout(r, 50))
      assert.equal((await entregaFila(entrega.id)).estado_correccion, 'evaluado')
    } finally {
      corr.configurarCorreccion({ automatica: false })
    }
  })
})

describe('US3: revisión, ajuste manual y auditoría', () => {
  test('10 y 11. el profesor ajusta puntaje y feedback: auditado, "Revisada por profesor" y nota recalculada (≤ 1 s)', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    await corr.procesarCola()
    const t0 = performance.now()
    const r = await ajustar(entrega.id, 'q1', { puntaje: 2.5, feedback: 'Te faltó el ejemplo.' })
    const ms = performance.now() - t0
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.ok(ms < 1000, `${ms} ms`)
    assert.equal(r.body.evaluacion.estado, 'revisada')
    assert.equal(r.body.evaluacion.puntajeFinal, 2.5)
    assert.equal(r.body.evaluacion.puntajeSugerido, 4) // el de la IA se conserva
    assert.equal(r.body.entrega.nota, 8.75) // (2.5 + 6 + 2) / 12 × 10
    const { body } = await revision(entrega.id)
    const cambios = body.auditoria.filter((a) => a.bloqueId === 'q1')
    assert.deepEqual(cambios.map((a) => [a.accion, a.valorAnterior, a.valorNuevo, a.actor]), [
      ['puntaje', 4, 2.5, 'profesor1'],
      ['feedback', 'Muy bien (q1).', 'Te faltó el ejemplo.', 'profesor1'],
    ])
    assert.ok(cambios.every((a) => a.fecha))
    // La respuesta original del alumno no cambia.
    assert.equal((await entregaFila(entrega.id)).respuestas.q1, RESPUESTAS_OK.q1)
    // La auditoría no se puede modificar ni borrar.
    await assert.rejects(e.pool.query("update auditoria_calificaciones set actor = 'otro' where entrega_id = $1", [entrega.id]))
    await assert.rejects(e.pool.query('delete from auditoria_calificaciones where entrega_id = $1', [entrega.id]))
  })

  test('validaciones del ajuste: rango, longitud, dueño', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    await corr.procesarCola()
    assert.equal((await ajustar(entrega.id, 'q1', { puntaje: 4.01 })).status, 400)
    assert.equal((await ajustar(entrega.id, 'q1', { puntaje: -1 })).status, 400)
    assert.equal((await ajustar(entrega.id, 'q1', { puntaje: '3' })).status, 400)
    assert.equal((await ajustar(entrega.id, 'q1', { feedback: 'x'.repeat(2001) })).status, 400)
    assert.equal((await ajustar(entrega.id, 'nope', { puntaje: 1 })).status, 404)
    const otro = await e.api('PUT', `/api/entregas/${entrega.id}/evaluaciones/q1`, { token: e.tokens.profesor2, body: { puntaje: 1 } })
    assert.equal(otro.status, 404)
    const alumno = await e.api('PUT', `/api/entregas/${entrega.id}/evaluaciones/q1`, { token: e.tokens.alumno1, body: { puntaje: 4 } })
    assert.equal(alumno.status, 403)
  })

  test('la revisión muestra los incidentes del modo restringido (Sprint 4)', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso({ bloques: BLOQUES })
    assert.equal((await comenzar(parcialId, 'alumno1')).status, 200)
    await e.api('POST', `/api/examen/${parcialId}/incidente`, { token: e.tokens.alumno1, body: { causa: 'VISIBILITY_HIDDEN', eventoId: nuevoId() } })
    await e.api('POST', `/api/turnos/${turnoId}/alumnos/alumno1/reanudar`, { token: e.tokens.profesor1, body: { eventoId: nuevoId() } })
    await e.api('POST', `/api/examen/${parcialId}/reingresar`, { token: e.tokens.alumno1, body: {} })
    const r = await e.api('POST', `/api/examen/${parcialId}/entregar`, { token: e.tokens.alumno1, body: { respuestas: RESPUESTAS_OK, seq: 5 } })
    assert.equal(r.status, 200)
    const { body } = await revision(r.body.entrega.id)
    const tipos = body.eventos.map((ev) => ev.tipo)
    assert.ok(tipos.includes('INCIDENT') && tipos.includes('RESUMED_BY_TEACHER') && tipos.includes('NORMAL_SUBMISSION'), tipos.join())
  })

  test('12. con un intento entregado no se pueden cambiar consignas, pesos ni criterios (backend)', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    const { rows: [d] } = await e.pool.query('select * from documentos where id = $1', [parcialId])
    const editar = (cambios) => e.api('PUT', `/api/documentos/${parcialId}`, {
      token: e.tokens.profesor1,
      body: { claseId: d.clase_id, titulo: d.titulo, tema: d.tema, duracion: d.duracion, bloques: d.bloques, horarios: [], umbralConfianza: 0.7, ...cambios },
    })
    const conPeso = structuredClone(d.bloques)
    conPeso[0].criterios[0].peso = 10
    const conPuntaje = structuredClone(d.bloques)
    conPuntaje[1].puntaje = 1
    const conCriterio = structuredClone(d.bloques)
    conCriterio[0].criterios.push(C('c3', 'Nuevo', 1))
    for (const bloques of [conPeso, conPuntaje, conCriterio]) {
      const r = await editar({ bloques })
      assert.equal(r.status, 409)
      assert.equal(r.body.codigo, 'estructura-bloqueada')
    }
    assert.equal((await editar({ umbralConfianza: 0.5 })).status, 409)
    assert.equal((await editar({ titulo: 'Otro título' })).status, 200) // lo que no es estructura sí
  })

  test('el formulario rechaza pesos y puntajes inválidos', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { rows: [d] } = await e.pool.query('select * from documentos where id = $1', [parcialId])
    const editar = (bloques, umbralConfianza = 0.7) => e.api('PUT', `/api/documentos/${parcialId}`, {
      token: e.tokens.profesor1,
      body: { claseId: d.clase_id, titulo: d.titulo, tema: d.tema, duracion: d.duracion, bloques, horarios: [], umbralConfianza },
    })
    const b = () => structuredClone(d.bloques)
    const peso0 = b(); peso0[0].criterios[0].peso = 0
    const sinTexto = b(); sinTexto[0].criterios[0].texto = ' '
    const puntaje0 = b(); puntaje0[0].puntaje = 0
    const puntajeTexto = b(); puntajeTexto[0].puntaje = '4'
    for (const bloques of [peso0, sinTexto, puntaje0, puntajeTexto]) assert.equal((await editar(bloques)).status, 400)
    assert.equal((await editar(b(), 1.5)).status, 400)
    assert.equal((await editar(b(), 0.55)).status, 200)
  })
})

describe('US4: publicación controlada', () => {
  test('13 y 15. publicación individual: bloqueada con ítems sin puntaje, después publica (≤ 3 s) y es idempotente', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    comportamiento = ({ block }) => (block.id === 'q2' ? new Error('caído') : null)
    await corr.procesarCola()
    const bloqueada = await publicar(entrega.id)
    assert.equal(bloqueada.status, 409)
    assert.deepEqual(bloqueada.body.pendientes.map((p) => p.bloqueId), ['q2'])
    assert.match(bloqueada.body.error, /pregunta 2/)
    assert.equal((await entregaFila(entrega.id)).estado_correccion, 'evaluado')

    assert.equal((await ajustar(entrega.id, 'q2', { puntaje: 5, feedback: 'Corregida a mano.' })).status, 200)
    const t0 = performance.now()
    const ok = await publicar(entrega.id)
    const ms = performance.now() - t0
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.ok(ms < 3000, `${ms} ms`)
    assert.equal(ok.body.entrega.estadoCorreccion, 'publicado')
    const fila = await entregaFila(entrega.id)
    assert.equal(fila.estado_correccion, 'publicado')
    assert.ok(fila.fecha_publicacion)
    assert.equal(fila.publicada_por, 'profesor1')
    assert.equal(Number(fila.nota), 9.17) // (4 + 5 + 2) / 12 × 10
    const otra = await publicar(entrega.id)
    assert.equal(otra.status, 200)
    assert.equal(otra.body.yaPublicada, true)
    const { body } = await revision(entrega.id)
    assert.equal(body.auditoria.filter((a) => a.accion === 'publicacion').length, 1)
    // Publicada, la nota ya no se modifica.
    assert.equal((await ajustar(entrega.id, 'q1', { puntaje: 1 })).status, 409)
  })

  test('14. publicación masiva: publica las listas, informa las pendientes y no duplica', async () => {
    const { parcialId, turnoId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const a1 = (await rendir(parcialId, 'alumno1', RESPUESTAS_OK)).entrega
    const a2 = (await rendir(parcialId, 'alumno2', { q1: 'algo', q2: 'def suma(a, b): return a+b', q3: 'o1' })).entrega
    comportamiento = ({ block, respuesta }) => (block.id === 'q1' && respuesta === 'algo' ? new Error('caído') : null)
    await corr.procesarCola()
    const { status, body } = await e.api('POST', `/api/turnos/${turnoId}/publicar`, { token: e.tokens.profesor1 })
    assert.equal(status, 200)
    assert.deepEqual(body.publicadas.map((p) => p.entregaId), [a1.id])
    assert.deepEqual(body.pendientes.map((p) => p.entregaId), [a2.id])
    assert.match(body.pendientes[0].motivo, /pregunta 1/)
    const segunda = await e.api('POST', `/api/turnos/${turnoId}/publicar`, { token: e.tokens.profesor1 })
    assert.deepEqual(segunda.body.publicadas, [])
    assert.deepEqual(segunda.body.yaPublicadas.map((p) => p.entregaId), [a1.id])
    const { rows } = await e.pool.query("select count(*)::int as n from auditoria_calificaciones where entrega_id = $1 and accion = 'publicacion'", [a1.id])
    assert.equal(rows[0].n, 1)
    // El seguimiento de corrección del turno lo refleja.
    const t = await e.api('GET', `/api/turnos/${turnoId}/correccion`, { token: e.tokens.profesor1 })
    const porAlumno = Object.fromEntries(t.body.alumnos.map((a) => [a.username, a.correccion?.estado ?? null]))
    assert.deepEqual(porAlumno, { alumno1: 'publicado', alumno2: 'evaluado', alumno3: null })
  })
})

describe('US5: consulta de notas por el alumno', () => {
  test('17. antes de publicar: 403 y ni la nota ni la devolución viajan por la API', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    await corr.procesarCola()
    const r = await resultado(entrega.id, 'alumno1')
    assert.equal(r.status, 403)
    assert.equal(r.body.codigo, 'no-publicada')
    const datos = await e.api('GET', '/api/datos', { token: e.tokens.alumno1 })
    const mia = datos.body.entregas.find((x) => x.id === entrega.id)
    assert.equal(mia.estadoCorreccion, 'en-correccion')
    assert.equal(mia.correccion, null)
    assert.equal(mia.nota, undefined)
    const examen = await e.api('GET', `/api/examen/${parcialId}`, { token: e.tokens.alumno1 })
    assert.equal(examen.body.entrega.correccion, null)
    assert.ok(!JSON.stringify(datos.body).includes('Muy bien ('))
  })

  test('16, 18 y 19. publicada: el alumno ve su resultado (≤ 2 s), sin datos internos; otro alumno recibe 403', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    await corr.procesarCola()
    await ajustar(entrega.id, 'q1', { puntaje: 3, feedback: 'Bien, pero sin ejemplo.' })
    assert.equal((await publicar(entrega.id)).status, 200)
    const t0 = performance.now()
    const r = await resultado(entrega.id, 'alumno1')
    const ms = performance.now() - t0
    assert.equal(r.status, 200)
    assert.ok(ms < 2000, `${ms} ms`)
    const res = r.body.resultado
    assert.equal(res.estado, 'publicado')
    assert.equal(res.nota, 9.17)
    assert.deepEqual(res.preguntas.map((p) => [p.bloqueId, p.puntaje, p.puntajeMax]), [['q1', 3, 4], ['q2', 6, 6], ['q3', 2, 2]])
    assert.equal(res.preguntas[0].feedback, 'Bien, pero sin ejemplo.')
    const texto = JSON.stringify(r.body)
    for (const interno of ['criterios', 'peso', 'confianza', 'juez', 'puntajeSugerido', 'feedbackSugerido', 'Muy bien (q1)', 'Menciona el límite', 'modelo']) {
      assert.ok(!texto.includes(interno), `el alumno recibió "${interno}"`)
    }
    // Las consignas que ve el alumno tampoco traen los criterios.
    const datos = await e.api('GET', '/api/datos', { token: e.tokens.alumno1 })
    assert.ok(!JSON.stringify(datos.body).includes('Menciona el límite'))
    const mia = datos.body.entregas.find((x) => x.id === entrega.id)
    assert.equal(mia.estadoCorreccion, 'publicado')
    assert.equal(mia.correccion.nota, 9.17)
    // Otro alumno, un profesor por la ruta del alumno o una entrega que no existe.
    assert.equal((await resultado(entrega.id, 'alumno2')).status, 403)
    assert.equal((await e.api('GET', `/api/entregas/${entrega.id}/resultado`, { token: e.tokens.profesor1 })).status, 403)
    assert.equal((await resultado('no-existe', 'alumno1')).status, 403)
    assert.equal((await e.api('GET', `/api/entregas/${entrega.id}/resultado`)).status, 401)
  })

  test('la nota única de Sprints anteriores no se usa en entregas con corrección por pregunta', async () => {
    const { parcialId } = await e.parcialEnCurso({ bloques: BLOQUES })
    const { entrega } = await rendir(parcialId, 'alumno1', RESPUESTAS_OK)
    const r = await e.api('PUT', `/api/entregas/${entrega.id}/correccion`, { token: e.tokens.profesor1, body: { nota: 10, comentario: '' } })
    assert.equal(r.status, 409)
  })
})

// Flujo integral del MVP con datos persistidos: crear examen → programar turno → rendir → autoguardar → incidente →
// entregar → corregir → revisar → publicar → consultar.
test('integración: flujo completo del MVP', async () => {
  // Próximo lunes (la clase es los lunes a la mañana), al menos una semana adelante.
  const fecha = new Date(Date.now() + 8 * 86_400_000)
  while (fecha.getUTCDay() !== 1) fecha.setUTCDate(fecha.getUTCDate() + 1)
  const creado = await e.api('POST', '/api/documentos', {
    token: e.tokens.profesor1,
    body: {
      claseId: 'clase1', titulo: 'Parcial integrador', tema: 'Tema 1', duracion: 60, bloques: BLOQUES, umbralConfianza: 0.75,
      horarios: [{ turno: 'manana', fecha: fecha.toISOString().slice(0, 10), horaInicio: '08:00' }],
    },
  })
  assert.equal(creado.status, 200, JSON.stringify(creado.body))
  const parcialId = creado.body.documento.id
  assert.equal(creado.body.documento.umbralConfianza, 0.75)
  assert.equal((await e.api('POST', `/api/documentos/${parcialId}/publicar`, { token: e.tokens.profesor1 })).status, 200)
  // Se toma ahora (abre un turno en curso con los alumnos de la clase).
  const tomado = await e.api('POST', `/api/documentos/${parcialId}/tomar-ahora`, { token: e.tokens.profesor1 })
  assert.equal(tomado.status, 200)
  const turnoId = tomado.body.turnoId

  assert.equal((await comenzar(parcialId, 'alumno3')).status, 200)
  // El alumno no ve los criterios.
  const examen = await e.api('GET', `/api/examen/${parcialId}`, { token: e.tokens.alumno3 })
  assert.ok(!JSON.stringify(examen.body).includes('Menciona el límite'))
  assert.equal(examen.body.documento.bloques[0].puntaje, 4)
  const g = await e.api('PUT', `/api/examen/${parcialId}/respuestas`, { token: e.tokens.alumno3, body: { respuestas: { q1: 'borrador' }, seq: 1 } })
  assert.equal(g.status, 200)
  await e.api('POST', `/api/examen/${parcialId}/incidente`, { token: e.tokens.alumno3, body: { causa: 'FULLSCREEN_EXIT', eventoId: nuevoId() } })
  assert.equal((await e.api('POST', `/api/turnos/${turnoId}/alumnos/alumno3/reanudar`, { token: e.tokens.profesor1, body: { eventoId: nuevoId() } })).status, 200)
  assert.equal((await e.api('POST', `/api/examen/${parcialId}/reingresar`, { token: e.tokens.alumno3, body: {} })).status, 200)
  const entregado = await e.api('POST', `/api/examen/${parcialId}/entregar`, { token: e.tokens.alumno3, body: { respuestas: RESPUESTAS_OK, seq: 2 } })
  assert.equal(entregado.status, 200)
  const entregaId = entregado.body.entrega.id

  comportamiento = ({ block, criterios }) => (block.id === 'q1'
    ? { criterios: criterios.map((c) => ({ id: c.id, nivel: c.id === 'c1' ? 'cumple' : 'parcial', justificacion: '' })), puntaje_sugerido: 3.5, feedback: 'Correcto; el ejemplo es mínimo.', confianza: 0.7 }
    : null)
  await corr.procesarCola()

  const rev = await revision(entregaId)
  assert.equal(rev.body.entrega.estadoCorreccion, 'evaluado')
  const q1 = rev.body.evaluaciones[0]
  assert.equal(q1.puntajeSugerido, 3.5) // 4 × (3 + 0.5)/4
  assert.equal(q1.bajaConfianza, true) // 0.7 < 0.75
  assert.ok(rev.body.eventos.some((ev) => ev.tipo === 'INCIDENT'))
  assert.equal(rev.body.entrega.respuestas.q1, RESPUESTAS_OK.q1)

  assert.equal((await resultado(entregaId, 'alumno3')).status, 403)
  assert.equal((await ajustar(entregaId, 'q1', { puntaje: 4 })).status, 200)
  const pub = await e.api('POST', `/api/turnos/${turnoId}/publicar`, { token: e.tokens.profesor1 })
  assert.deepEqual(pub.body.publicadas.map((p) => p.entregaId), [entregaId])
  const final = await resultado(entregaId, 'alumno3')
  assert.equal(final.status, 200)
  assert.equal(final.body.resultado.nota, 10)
  assert.equal(final.body.resultado.titulo, 'Parcial integrador')
})
