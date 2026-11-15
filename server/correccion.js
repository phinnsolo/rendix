// Corrección automática en el servidor: cola persistente de agentes jueces (tabla `evaluaciones`), reintentos,
// baja confianza, revisión docente con auditoría y publicación de notas. Las reglas (puntajes, criterios, validación
// del resultado, nota) vienen de src/correccion.js.
//
// Cola: al crearse una entrega se inserta, en la misma transacción, una fila por pregunta (`unique (entrega_id,
// bloque_id)`: un reintento del pedido no duplica nada). No hay tareas en memoria: si la función se reinicia, las filas
// siguen ahí. Las procesa `procesarCola`, que se dispara sin bloquear la respuesta (después de cada entrega y en cada
// consulta del panel docente, como la normalización de sesiones del Sprint 4) y desde GET /api/correcciones/procesar
// (cron). Cada fila se toma con `for update skip locked` y queda "procesando" con la hora: si el proceso muere, otra
// pasada la vuelve a tomar. La llamada al modelo se hace sin conexión a la base tomada, así no frena a los alumnos.

import { HttpError } from './http.js'
import { query, tx } from './db.js'
import { JuezSinConfigurar, VERSION_PROMPT, juezClaude } from './juez.js'
import { getBlocks } from '../src/documentBlocks.js'
import {
  FEEDBACK_MAXIMO, INTENTOS_MAXIMOS, ResultadoInvalido, calcularNota, criteriosDe, modoEvaluacion, pendientesDePublicar,
  puntajeDe, redondear, respuestaVacia,
} from '../src/correccion.js'

// Una pregunta tomada por un juez que no terminó en este tiempo (proceso caído) vuelve a la cola.
export const VENCIMIENTO_TOMA_MS = 3 * 60_000
// Espera antes de cada reintento automático (después del 1.º y del 2.º intento fallido).
export const ESPERAS_REINTENTO_MS = [5_000, 20_000]
const ESPERA_SIN_CONFIGURAR_MS = 60_000

const config = { juez: juezClaude, automatica: true, esperasMs: ESPERAS_REINTENTO_MS }

// Solo para pruebas: reemplaza el juez (mock) o desactiva el disparo automático para llamar a procesarCola a mano.
export function configurarCorreccion(cambios) {
  Object.assign(config, cambios)
}

const iso = (f) => (f ? new Date(f).toISOString() : null)
const num = (v) => (v == null ? null : Number(v))

// --- Encolado

// Crea las evaluaciones de una entrega recién creada (dentro de la transacción de la entrega). Las respuestas vacías
// quedan con 0 y la marca "Requiere revisión"; el multiple choice se corrige comparando con la opción correcta; GeoGebra
// queda pendiente de corrección manual; texto y código van a la cola de los jueces.
export async function encolarEntrega(client, entregaId) {
  const { rows: [e] } = await client.query('select id, bloques, respuestas from entregas where id = $1', [entregaId])
  if (!e) return 0
  const bloques = getBlocks({ id: e.id, bloques: e.bloques })
  let encoladas = 0
  for (const [orden, block] of bloques.entries()) {
    const max = puntajeDe(block)
    const valor = e.respuestas?.[block.id]
    const fila = { estado: 'pendiente', puntaje: null, feedback: null, criterios: [], confianza: null, vacia: false, revision: false, juez: null }
    if (respuestaVacia(block, valor)) {
      Object.assign(fila, {
        estado: 'evaluada', puntaje: 0, feedback: 'No hay respuesta para esta pregunta.', vacia: true, revision: true,
        criterios: criteriosDe(block).map((c) => ({ ...c, cumplimiento: 0, justificacion: 'Sin respuesta.' })),
        juez: { modelo: 'regla-respuesta-vacia', version: VERSION_PROMPT },
      })
    } else if (modoEvaluacion(block) === 'automatica') {
      const correcta = block.opciones.find((o) => o.correcta)
      const acierta = correcta?.id === valor
      Object.assign(fila, {
        estado: 'evaluada', puntaje: acierta ? max : 0, confianza: 1,
        feedback: acierta ? 'Respuesta correcta.' : `Respuesta incorrecta. La opción correcta era: "${correcta?.texto ?? '—'}".`,
        criterios: [{ id: 'opcion-correcta', texto: 'Elige la opción correcta.', peso: 1, cumplimiento: acierta ? 1 : 0, justificacion: '' }],
        juez: { modelo: 'regla-opcion-correcta', version: VERSION_PROMPT },
      })
    } else if (modoEvaluacion(block) === 'manual') {
      Object.assign(fila, { estado: 'manual', revision: true })
    } else {
      encoladas += 1
    }
    const evaluada = fila.estado === 'evaluada'
    await client.query(
      `insert into evaluaciones (entrega_id, bloque_id, orden, puntaje_max, estado, puntaje_sugerido, puntaje_final,
                                 feedback_sugerido, feedback_final, criterios, confianza, respuesta_vacia, requiere_revision,
                                 juez, fecha_evaluacion)
       values ($1, $2, $3, $4, $5, $6, $6, $7, $7, $8, $9, $10, $11, $12, $13)
       on conflict (entrega_id, bloque_id) do nothing`,
      [entregaId, block.id, orden, max, fila.estado, fila.puntaje, fila.feedback, JSON.stringify(fila.criterios), fila.confianza,
        fila.vacia, fila.revision, fila.juez && JSON.stringify(fila.juez), evaluada ? new Date() : null]
    )
  }
  await actualizarEntrega(client, entregaId)
  if (encoladas > 0) hayTrabajo = true
  return encoladas
}

// Recalcula el estado de corrección y la nota de una entrega a partir de sus evaluaciones (salvo si ya se publicó).
// Devuelve la fila de la entrega actualizada.
export async function actualizarEntrega(client, entregaId) {
  const { rows: items } = await client.query('select estado, intentos, puntaje_max, puntaje_final from evaluaciones where entrega_id = $1', [entregaId])
  if (items.length === 0) {
    const { rows: [e] } = await client.query('select * from entregas where id = $1', [entregaId])
    return e
  }
  const enCola = items.filter((i) => i.estado === 'pendiente' || i.estado === 'procesando')
  const empezada = items.some((i) => i.estado === 'procesando' || i.intentos > 0)
  const estado = enCola.length === 0 ? 'evaluado' : empezada ? 'en-evaluacion' : 'entregado'
  const { nota } = calcularNota(items.map((i) => ({ puntajeMax: i.puntaje_max, puntajeFinal: i.puntaje_final })))
  const { rows: [e] } = await client.query(
    `update entregas set estado_correccion = case when estado_correccion = 'publicado' then estado_correccion else $2 end,
       nota = case when estado_correccion = 'publicado' then nota else $3 end
     where id = $1 returning *`,
    [entregaId, estado, nota]
  )
  return e
}

// --- Procesamiento de la cola

// Toma hasta `limite` preguntas disponibles. Primero devuelve a la cola las que quedaron "procesando" de un proceso
// que murió (o las pasa a error si ya no les quedan intentos).
async function tomarTrabajos(limite) {
  return tx(async (c) => {
    const vencida = new Date(Date.now() - VENCIMIENTO_TOMA_MS)
    const { rows: colgadas } = await c.query(
      `update evaluaciones set
         estado = case when intentos >= $2 then 'error' else 'pendiente' end,
         requiere_revision = requiere_revision or intentos >= $2,
         ultimo_error = 'El juez no respondió (proceso interrumpido).', tomada_en = null
       where estado = 'procesando' and tomada_en < $1 returning entrega_id`,
      [vencida, INTENTOS_MAXIMOS]
    )
    for (const id of new Set(colgadas.map((r) => r.entrega_id))) await actualizarEntrega(c, id)

    const { rows } = await c.query(
      `update evaluaciones set estado = 'procesando', intentos = intentos + 1, tomada_en = now()
       where id in (
         select id from evaluaciones where estado = 'pendiente' and disponible_desde <= now()
         order by disponible_desde, orden limit $1 for update skip locked
       )
       returning *`,
      [limite]
    )
    if (rows.length === 0) return []
    const entregaIds = [...new Set(rows.map((r) => r.entrega_id))]
    const { rows: entregas } = await c.query('select id, bloques, respuestas, umbral_confianza from entregas where id = any($1)', [entregaIds])
    for (const id of entregaIds) await actualizarEntrega(c, id)
    const porId = new Map(entregas.map((e) => [e.id, e]))
    return rows.map((r) => ({ evaluacion: r, entrega: porId.get(r.entrega_id) }))
  })
}

// Corrige una pregunta tomada y guarda el resultado. Solo escribe si la fila sigue tomada por este mismo intento
// (si el profesor la corrigió a mano mientras tanto, o la tomó otro proceso, no pisa nada).
async function procesarTrabajo({ evaluacion: ev, entrega }) {
  const block = getBlocks({ id: entrega.id, bloques: entrega.bloques }).find((b) => b.id === ev.bloque_id)
  const criterios = criteriosDe(block)
  const puntajeMax = Number(ev.puntaje_max)
  const condicion = "where id = $1 and estado = 'procesando' and intentos = $2"
  try {
    if (!block) throw new ResultadoInvalido('La pregunta ya no existe en la copia de la entrega.')
    // El juez recibe solo la pregunta, la respuesta, los criterios y el máximo: nada del alumno.
    const r = await config.juez({ block, respuesta: String(entrega.respuestas?.[block.id] ?? ''), criterios, puntajeMax })
    if (!(r.puntaje >= 0 && r.puntaje <= puntajeMax) || typeof r.feedback !== 'string' || r.feedback.length > FEEDBACK_MAXIMO) {
      throw new ResultadoInvalido('Resultado del juez fuera de rango.')
    }
    const baja = r.confianza < Number(entrega.umbral_confianza)
    await tx(async (c) => {
      const { rowCount } = await c.query(
        `update evaluaciones set estado = 'evaluada', puntaje_sugerido = $3, puntaje_final = $3, feedback_sugerido = $4,
           feedback_final = $4, criterios = $5, confianza = $6, baja_confianza = $7, requiere_revision = $7,
           juez = $8, ultimo_error = null, fecha_evaluacion = now(), tomada_en = null
         ${condicion}`,
        [ev.id, ev.intentos, redondear(r.puntaje), r.feedback, JSON.stringify(r.criterios), r.confianza, baja,
          JSON.stringify({ ...(r.juez ?? {}), puntajeModelo: r.puntajeModelo ?? null, intentos: ev.intentos })]
      )
      if (rowCount > 0) await actualizarEntrega(c, ev.entrega_id)
    })
    return 'evaluada'
  } catch (e) {
    const mensaje = String(e?.message || e || 'Error desconocido').slice(0, 500)
    if (e instanceof JuezSinConfigurar) {
      // Falta configuración: no cuenta como intento. Queda en cola y el panel avisa.
      await tx(async (c) => {
        const { rowCount } = await c.query(
          `update evaluaciones set estado = 'pendiente', intentos = intentos - 1, tomada_en = null, ultimo_error = $3,
             disponible_desde = now() + make_interval(secs => $4) ${condicion}`,
          [ev.id, ev.intentos, mensaje, ESPERA_SIN_CONFIGURAR_MS / 1000]
        )
        if (rowCount > 0) await actualizarEntrega(c, ev.entrega_id)
      })
      return 'sin-configurar'
    }
    console.error(`[correccion] evaluación ${ev.id} (intento ${ev.intentos}/${INTENTOS_MAXIMOS}): ${mensaje}`)
    const agotada = ev.intentos >= INTENTOS_MAXIMOS
    await tx(async (c) => {
      const { rowCount } = await c.query(
        agotada
          // Sin más reintentos: Error y pendiente de corrección manual. La respuesta original no se toca.
          ? `update evaluaciones set estado = 'error', requiere_revision = true, ultimo_error = $3, tomada_en = null ${condicion}`
          : `update evaluaciones set estado = 'pendiente', ultimo_error = $3, tomada_en = null,
               disponible_desde = now() + make_interval(secs => $4) ${condicion}`,
        agotada ? [ev.id, ev.intentos, mensaje] : [ev.id, ev.intentos, mensaje, config.esperasMs[ev.intentos - 1] / 1000]
      )
      if (rowCount > 0) await actualizarEntrega(c, ev.entrega_id)
    })
    return agotada ? 'error' : 'reintento'
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

// Procesa la cola hasta vaciarla (o hasta `maxMs`). Los jueces corren en paralelo, de a `concurrencia`, y cada uno
// es independiente: una falla no frena a los demás. Si quedan reintentos que vencen pronto, los espera.
export async function procesarCola({ concurrencia = 4, maxMs = 45_000, esperarReintentos = true } = {}) {
  const fin = Date.now() + maxMs
  const resumen = { evaluada: 0, reintento: 0, error: 0, 'sin-configurar': 0 }
  while (Date.now() < fin) {
    const trabajos = await tomarTrabajos(concurrencia)
    if (trabajos.length === 0) {
      if (!esperarReintentos) break
      const { rows: [prox] } = await query(
        "select min(disponible_desde) as cuando from evaluaciones where estado = 'pendiente' and ultimo_error is not null and intentos > 0"
      )
      const espera = prox?.cuando ? new Date(prox.cuando).getTime() - Date.now() : null
      if (espera == null || Date.now() + espera > fin) break
      await dormir(Math.max(50, espera))
      continue
    }
    const resultados = await Promise.all(trabajos.map(procesarTrabajo))
    for (const r of resultados) resumen[r] += 1
  }
  return resumen
}

// --- Disparo en segundo plano (sin bloquear la respuesta)

let hayTrabajo = false
let drenando = null

// En Vercel, waitUntil mantiene viva la función hasta que termine la promesa aunque la respuesta ya se haya enviado
// (es lo que hace @vercel/functions por dentro). En el servidor de desarrollo, la promesa simplemente sigue corriendo.
function enSegundoPlano(promesa) {
  const contexto = globalThis[Symbol.for('@vercel/request-context')]?.get?.()
  contexto?.waitUntil?.(promesa)
}

// Arranca una pasada por la cola si no hay una en curso en este proceso. `forzar`: aunque no se haya encolado nada
// en este proceso (el panel del profesor la dispara para retomar reintentos o trabajos de otra instancia).
export function programarCorreccion({ forzar = false } = {}) {
  if (!config.automatica || (!hayTrabajo && !forzar)) return
  hayTrabajo = false
  if (drenando) return
  drenando = procesarCola()
    .catch((e) => console.error('[correccion] la pasada por la cola falló:', e))
    .finally(() => {
      drenando = null
      if (hayTrabajo) programarCorreccion()
    })
  enSegundoPlano(drenando)
}

// --- Vistas

// Evaluación de una pregunta para el profesor (con los datos internos del juez).
export function aEvaluacion(r) {
  return {
    id: r.id,
    bloqueId: r.bloque_id,
    orden: r.orden,
    puntajeMax: num(r.puntaje_max),
    estado: r.estado,
    intentos: r.intentos,
    ultimoError: r.ultimo_error,
    puntajeSugerido: num(r.puntaje_sugerido),
    feedbackSugerido: r.feedback_sugerido,
    criterios: r.criterios ?? [],
    confianza: num(r.confianza),
    puntajeFinal: num(r.puntaje_final),
    feedbackFinal: r.feedback_final,
    respuestaVacia: r.respuesta_vacia,
    bajaConfianza: r.baja_confianza,
    requiereRevision: r.requiere_revision,
    juez: r.juez,
    revisadaPor: r.revisada_por,
    fechaRevision: iso(r.fecha_revision),
    fechaEvaluacion: iso(r.fecha_evaluacion),
  }
}

// Resumen de la corrección de cada entrega (para listas y chips): { [entregaId]: { total, enCola, errores, ... } }.
export async function resumenesDe(client, entregaIds) {
  if (entregaIds.length === 0) return {}
  const { rows } = await client.query(
    `select entrega_id, count(*)::int as total,
       count(*) filter (where estado in ('pendiente', 'procesando'))::int as en_cola,
       count(*) filter (where estado = 'error')::int as errores,
       count(*) filter (where estado = 'manual')::int as manuales,
       count(*) filter (where baja_confianza and estado <> 'revisada')::int as baja_confianza,
       count(*) filter (where respuesta_vacia and estado <> 'revisada')::int as vacias,
       count(*) filter (where puntaje_final is null)::int as sin_puntaje,
       count(*) filter (where estado = 'revisada')::int as revisadas,
       max(ultimo_error) filter (where estado = 'pendiente') as error_cola
     from evaluaciones where entrega_id = any($1) group by entrega_id`,
    [entregaIds]
  )
  return Object.fromEntries(rows.map((r) => [r.entrega_id, {
    total: r.total, enCola: r.en_cola, errores: r.errores, manuales: r.manuales, bajaConfianza: r.baja_confianza,
    vacias: r.vacias, sinPuntaje: r.sin_puntaje, revisadas: r.revisadas, errorCola: r.error_cola,
  }]))
}

export async function evaluacionesDe(client, entregaId) {
  const { rows } = await client.query('select * from evaluaciones where entrega_id = $1 order by orden', [entregaId])
  return rows
}

export async function auditoriaDe(client, entregaId) {
  const { rows } = await client.query(
    `select a.*, u.nombre as actor_nombre from auditoria_calificaciones a left join usuarios u on u.username = a.actor
     where a.entrega_id = $1 order by a.fecha, a.secuencia`,
    [entregaId]
  )
  return rows.map((a) => ({
    id: a.id, bloqueId: a.bloque_id, accion: a.accion, valorAnterior: a.valor_anterior, valorNuevo: a.valor_nuevo,
    actor: a.actor, actorNombre: a.actor_nombre ?? a.actor, fecha: iso(a.fecha),
  }))
}

async function auditar(client, { entregaId, evaluacionId = null, bloqueId = null, accion, anterior, nuevo, actor }) {
  await client.query(
    `insert into auditoria_calificaciones (entrega_id, evaluacion_id, bloque_id, accion, valor_anterior, valor_nuevo, actor)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [entregaId, evaluacionId, bloqueId, accion, JSON.stringify(anterior ?? null), JSON.stringify(nuevo ?? null), actor]
  )
}

// --- Revisión docente

async function entregaDelProfesor(client, entregaId, profesor) {
  const { rows: [e] } = await client.query('select * from entregas where id = $1 and profesor = $2 for update', [entregaId, profesor])
  if (!e) throw new HttpError(404, 'La entrega no existe.')
  return e
}

const dosDecimales = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9

// El profesor cambia el puntaje y/o el feedback de una pregunta (también una pendiente de corrección manual). Guarda
// valor anterior y nuevo en la auditoría, marca "Revisada por profesor" y recalcula la nota. La respuesta del alumno
// no se toca.
export async function revisarEvaluacion(client, { entregaId, bloqueId, body, profesor }) {
  const entrega = await entregaDelProfesor(client, entregaId, profesor)
  if (entrega.estado_correccion === 'publicado') throw new HttpError(409, 'La nota ya fue publicada: no se puede modificar.', { codigo: 'publicada' })
  const { rows: [ev] } = await client.query('select * from evaluaciones where entrega_id = $1 and bloque_id = $2 for update', [entregaId, bloqueId])
  if (!ev) throw new HttpError(404, 'La pregunta no existe en esta entrega.')
  const max = Number(ev.puntaje_max)
  const cambios = {}
  if (body.puntaje !== undefined) {
    const p = body.puntaje
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > max || !dosDecimales(p)) {
      throw new HttpError(400, `El puntaje tiene que ser un número entre 0 y ${max} (hasta 2 decimales).`, { errores: { puntaje: 'Fuera de rango.' } })
    }
    cambios.puntaje = p
  }
  if (body.feedback !== undefined) {
    if (typeof body.feedback !== 'string' || body.feedback.length > FEEDBACK_MAXIMO) {
      throw new HttpError(400, `El feedback puede tener hasta ${FEEDBACK_MAXIMO} caracteres.`, { errores: { feedback: 'Demasiado largo.' } })
    }
    cambios.feedback = body.feedback.trim()
  }
  if (Object.keys(cambios).length === 0) throw new HttpError(400, 'Indicá el puntaje o el feedback.')
  const puntajeFinal = cambios.puntaje ?? num(ev.puntaje_final)
  if (puntajeFinal == null) throw new HttpError(400, 'Asigná un puntaje a esta pregunta.', { errores: { puntaje: 'Falta el puntaje.' } })

  if (cambios.puntaje !== undefined && cambios.puntaje !== num(ev.puntaje_final)) {
    await auditar(client, { entregaId, evaluacionId: ev.id, bloqueId, accion: 'puntaje', anterior: num(ev.puntaje_final), nuevo: cambios.puntaje, actor: profesor })
  }
  if (cambios.feedback !== undefined && cambios.feedback !== (ev.feedback_final ?? '')) {
    await auditar(client, { entregaId, evaluacionId: ev.id, bloqueId, accion: 'feedback', anterior: ev.feedback_final, nuevo: cambios.feedback, actor: profesor })
  }
  const { rows: [nueva] } = await client.query(
    `update evaluaciones set estado = 'revisada', puntaje_final = $2, feedback_final = $3, requiere_revision = false,
       revisada_por = $4, fecha_revision = now(), tomada_en = null
     where id = $1 returning *`,
    [ev.id, puntajeFinal, cambios.feedback ?? ev.feedback_final, profesor]
  )
  const actualizada = await actualizarEntrega(client, entregaId)
  return { evaluacion: aEvaluacion(nueva), entrega: actualizada }
}

// Vuelve a mandar a los jueces las preguntas en Error (o encola una entrega que no tenía corrección automática, como
// las anteriores a este sprint). No toca las ya evaluadas ni las revisadas por el profesor.
export async function reevaluar(client, { entregaId, profesor }) {
  const entrega = await entregaDelProfesor(client, entregaId, profesor)
  if (entrega.estado_correccion === 'publicado') throw new HttpError(409, 'La nota ya fue publicada.', { codigo: 'publicada' })
  const { rows: [{ n }] } = await client.query('select count(*)::int as n from evaluaciones where entrega_id = $1', [entregaId])
  if (n === 0) {
    await encolarEntrega(client, entregaId)
  } else {
    const { rows } = await client.query(
      `update evaluaciones set estado = 'pendiente', intentos = 0, disponible_desde = now(), ultimo_error = null
       where entrega_id = $1 and estado = 'error' returning id, bloque_id`,
      [entregaId]
    )
    for (const r of rows) await auditar(client, { entregaId, evaluacionId: r.id, bloqueId: r.bloque_id, accion: 'reevaluacion', anterior: 'error', nuevo: 'pendiente', actor: profesor })
    if (rows.length > 0) hayTrabajo = true
  }
  return actualizarEntrega(client, entregaId)
}

// --- Publicación

// Motivo por el que una entrega no se puede publicar ({ mensaje, pendientes }) o null.
async function motivoNoPublicable(client, entrega) {
  const evaluaciones = await evaluacionesDe(client, entrega.id)
  if (evaluaciones.length === 0) {
    // Entregas anteriores a la corrección automática: se publican con la nota que puso el profesor.
    if (entrega.correccion?.nota != null) return null
    return { mensaje: 'La entrega todavía no tiene corrección.', pendientes: [] }
  }
  const pendientes = pendientesDePublicar(evaluaciones.map((r) => ({ bloqueId: r.bloque_id, orden: r.orden, estado: r.estado, puntajeFinal: num(r.puntaje_final) })))
  if (pendientes.length === 0) return null
  const lista = pendientes.map((p) => `pregunta ${p.orden + 1}`).join(', ')
  return { mensaje: `Faltan puntajes definitivos: ${lista}.`, pendientes }
}

// Publica la nota de una entrega: la deja visible para el alumno. Idempotente: si ya estaba publicada no cambia nada.
export async function publicarEntrega(client, { entregaId, profesor }) {
  const entrega = await entregaDelProfesor(client, entregaId, profesor)
  if (entrega.estado_correccion === 'publicado') return { entrega, yaPublicada: true }
  const motivo = await motivoNoPublicable(client, entrega)
  if (motivo) throw new HttpError(409, motivo.mensaje, { codigo: 'incompleta', pendientes: motivo.pendientes })
  const evaluaciones = await evaluacionesDe(client, entregaId)
  const nota = evaluaciones.length > 0
    ? calcularNota(evaluaciones.map((r) => ({ puntajeMax: r.puntaje_max, puntajeFinal: r.puntaje_final }))).nota
    : Number(entrega.correccion.nota)
  const ahora = new Date()
  const correccion = { nota, comentario: entrega.correccion?.comentario ?? '', fecha: ahora.toISOString() }
  const { rows: [publicada] } = await client.query(
    `update entregas set estado_correccion = 'publicado', nota = $2, correccion = $3, fecha_publicacion = $4, publicada_por = $5
     where id = $1 and estado_correccion <> 'publicado' returning *`,
    [entregaId, nota, correccion, ahora, profesor]
  )
  await auditar(client, { entregaId, accion: 'publicacion', anterior: entrega.estado_correccion, nuevo: { estado: 'publicado', nota }, actor: profesor })
  return { entrega: publicada, yaPublicada: false }
}

// Publicación masiva de un turno: publica cada entrega lista (cada una en su transacción) y devuelve cuáles se
// publicaron, cuáles ya estaban publicadas y cuáles quedaron pendientes con el motivo.
export async function publicarTurno({ turnoId, profesor }) {
  const { rows: [turno] } = await query('select * from turnos where id = $1 and profesor = $2', [turnoId, profesor])
  if (!turno) throw new HttpError(404, 'El turno no existe.')
  const { rows: entregas } = await query(
    'select id, alumno, alumno_nombre, estado_correccion from entregas where parcial_id = $1 and alumno = any($2) order by alumno_nombre',
    [turno.parcial_id, turno.alumnos]
  )
  const resultado = { publicadas: [], yaPublicadas: [], pendientes: [] }
  for (const e of entregas) {
    const dato = { entregaId: e.id, alumno: e.alumno, alumnoNombre: e.alumno_nombre }
    if (e.estado_correccion === 'publicado') {
      resultado.yaPublicadas.push(dato)
      continue
    }
    try {
      const { yaPublicada } = await tx((c) => publicarEntrega(c, { entregaId: e.id, profesor }))
      resultado[yaPublicada ? 'yaPublicadas' : 'publicadas'].push(dato)
    } catch (err) {
      if (!(err instanceof HttpError)) throw err
      resultado.pendientes.push({ ...dato, motivo: err.message })
    }
  }
  return resultado
}

// Resultado publicado que ve el alumno: solo puntajes definitivos y feedback aprobado. Nada de criterios, pesos,
// puntajes sugeridos, confianza ni datos del juez.
export async function resultadoParaAlumno(client, entrega) {
  const evaluaciones = await evaluacionesDe(client, entrega.id)
  const bloques = new Map(getBlocks({ id: entrega.id, bloques: entrega.bloques }).map((b) => [b.id, b]))
  const preguntas = evaluaciones.map((r) => ({
    bloqueId: r.bloque_id,
    orden: r.orden,
    tipo: bloques.get(r.bloque_id)?.tipo ?? null,
    consigna: bloques.get(r.bloque_id)?.consigna ?? '',
    puntaje: num(r.puntaje_final),
    puntajeMax: num(r.puntaje_max),
    feedback: r.feedback_final ?? '',
  }))
  const { total, maximo } = calcularNota(preguntas.map((p) => ({ puntajeMax: p.puntajeMax, puntajeFinal: p.puntaje })))
  return {
    entregaId: entrega.id,
    parcialId: entrega.parcial_id,
    titulo: entrega.titulo,
    tema: entrega.tema,
    estado: 'publicado',
    nota: num(entrega.nota) ?? num(entrega.correccion?.nota),
    total: preguntas.length > 0 ? total : null,
    maximo: preguntas.length > 0 ? maximo : null,
    devolucion: entrega.correccion?.comentario ?? '',
    fechaPublicacion: iso(entrega.fecha_publicacion),
    preguntas,
  }
}
