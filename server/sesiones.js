// Modo restringido en el servidor: todas las transiciones de estado de una sesión de examen y los eventos de
// trazabilidad que dejan. Las transiciones válidas vienen de src/estadoExamen.js.
//
// Cada transición es un UPDATE condicionado al estado actual (`where estado = <desde>`) dentro de una transacción
// con la fila bloqueada: si dos pedidos llegan juntos (ej. SALIR y una salida de pantalla completa), el primero
// gana y el segundo ve el estado nuevo. Los eventos se insertan con una clave de idempotencia: un reintento no
// los duplica. La hora oficial es siempre la del servidor.

import { EVENTOS, SESION, SENALES, UMBRAL_LATIDO_MS, assertTransicion, esSenal } from '../src/estadoExamen.js'
import { HttpError } from './http.js'
import { TOLERANCIA_MS, crearEntrega } from './datos.js'

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// Clave de idempotencia que manda el cliente (un id generado por evento). Si no es válida, se ignora.
export function claveCliente(valor) {
  return typeof valor === 'string' && /^[\w-]{8,100}$/.test(valor) ? valor : null
}

// Hora del dispositivo del alumno: solo diagnóstico, nunca se usa como hora oficial.
export function fechaCliente(valor) {
  const fecha = typeof valor === 'number' || typeof valor === 'string' ? new Date(valor) : null
  return fecha && Number.isFinite(fecha.getTime()) && Math.abs(fecha.getTime() - Date.now()) < 7 * 86_400_000 ? fecha : null
}

// Señales que manda el cliente junto con un incidente: [{ tipo, fechaCliente }], sin repetir y con tipos conocidos.
export function senalesCliente(lista) {
  if (!Array.isArray(lista)) return []
  const vistas = new Set()
  const senales = []
  for (const s of lista.slice(0, 10)) {
    if (!esObjeto(s) || !esSenal(s.tipo) || s.tipo === 'HEARTBEAT_TIMEOUT' || vistas.has(s.tipo)) continue
    vistas.add(s.tipo)
    senales.push({ tipo: s.tipo, fechaCliente: fechaCliente(s.fechaCliente) })
  }
  return senales
}

// Agrega un evento a la trazabilidad (append-only: la tabla no admite UPDATE ni DELETE). `s` es la fila de la sesión.
// Con `clave`, un segundo evento con la misma clave para la misma sesión no se inserta. Devuelve true si se insertó.
export async function registrarEvento(client, s, tipo, { actor, ahora, clave = null, metadata = {}, fechaCliente = null }) {
  if (!Object.hasOwn(EVENTOS, tipo)) throw new Error(`Tipo de evento desconocido: ${tipo}`)
  const { rowCount } = await client.query(
    `insert into eventos_seguridad (sesion_id, turno_id, parcial_id, alumno, tipo, fecha_servidor, fecha_cliente, actor,
                                    clave_idempotencia, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (sesion_id, clave_idempotencia) do nothing`,
    [s.id, s.turno_id, s.parcial_id, s.alumno, tipo, ahora, fechaCliente, actor, clave, JSON.stringify(metadata)]
  )
  return rowCount > 0
}

export async function eventoExiste(client, sesionId, clave) {
  if (!clave) return false
  const { rows } = await client.query('select 1 from eventos_seguridad where sesion_id = $1 and clave_idempotencia = $2', [sesionId, clave])
  return rows.length > 0
}

// Las respuestas que manda el cliente junto con una transición (flush inmediato) se guardan si son más nuevas que
// las del servidor y si llegan a tiempo. Si no, queda lo último guardado.
function respuestasFinales(s, body, ahora) {
  const enTiempo = ahora.getTime() <= s.deadline.getTime() + TOLERANCIA_MS
  const nuevas = enTiempo && esObjeto(body.respuestas) && Number.isSafeInteger(body.seq) && body.seq > Number(s.seq)
  return { enTiempo, respuestas: nuevas ? body.respuestas : s.respuestas, seq: nuevas ? body.seq : Number(s.seq) }
}

// --- Incidente

// en-curso → incidente. Guarda el tiempo que le quedaba (para reanudar con ese tiempo), la causa y las señales.
// `restanteMs`: si no se indica, el que queda hasta la hora límite en `ahora`.
export async function marcarIncidente(client, s, { causa, senales = [], ahora, actor, clave = null, fechaCliente = null, body = {}, restanteMs = null, metadata = {} }) {
  assertTransicion(s.estado, SESION.INCIDENTE)
  const { respuestas, seq } = respuestasFinales(s, body, ahora)
  const restante = Math.max(0, restanteMs ?? s.deadline.getTime() - ahora.getTime())
  const { rows: [nueva] } = await client.query(
    `update sesiones_examen set estado = 'incidente', restante_ms = $3, incidente_fecha = $4, incidente_causa = $5,
       respuestas = $6, seq = $7, pendientes = false, fecha_modificacion = $4
     where turno_id = $1 and alumno = $2 and estado = 'en-curso' returning *`,
    [s.turno_id, s.alumno, restante, ahora, causa, JSON.stringify(respuestas), seq]
  )
  if (!nueva) return null
  // Una sola acción del alumno puede disparar varias señales casi juntas: un único incidente, con cada señal anotada.
  const todas = senales.some((x) => x.tipo === causa) ? senales : [{ tipo: causa, fechaCliente }, ...senales]
  for (const senal of todas) {
    await registrarEvento(client, nueva, senal.tipo, {
      actor, ahora, fechaCliente: senal.fechaCliente ?? null, clave: clave && `${clave}:${senal.tipo}`,
      metadata: senal.tipo === 'HEARTBEAT_TIMEOUT' ? metadata : {},
    })
  }
  await registrarEvento(client, nueva, 'INCIDENT', {
    actor, ahora, fechaCliente, clave: clave && `incidente:${clave}`,
    metadata: { causa, descripcion: SENALES[causa] ?? causa, senales: todas.map((x) => x.tipo), restanteMs: restante, ...metadata },
  })
  return nueva
}

// --- Normalización (sin procesos persistentes: se hace al leer)

// Sesiones en curso sin latido durante UMBRAL_LATIDO_MS → incidente (HEARTBEAT_TIMEOUT), con el tiempo que les
// quedaba en el último latido. Después, las que pasaron la hora límite se entregan con lo último guardado.
// `filtro` es una condición SQL sobre `s` (sesiones_examen) con el parámetro $1. Se llama antes de leer sesiones,
// así ningún endpoint ve como "en curso" una sesión que dejó de responder o que venció.
export async function normalizarSesiones(client, filtro, valor) {
  const ahora = new Date()
  const { rows } = await client.query(
    `select s.* from sesiones_examen s
     where s.estado = 'en-curso' and not s.reingreso_pendiente and s.ultimo_latido < $2 and ${filtro}
     for update skip locked`,
    [valor, new Date(ahora.getTime() - UMBRAL_LATIDO_MS)]
  )
  for (const s of rows) {
    // Si la señal se perdió recién al final, no es un incidente: la entrega por vencimiento se encarga.
    if (s.ultimo_latido.getTime() + UMBRAL_LATIDO_MS >= s.deadline.getTime()) continue
    await marcarIncidente(client, s, {
      causa: 'HEARTBEAT_TIMEOUT', ahora, actor: 'sistema', clave: `latido:${s.ultimo_latido.getTime()}`,
      restanteMs: s.deadline.getTime() - s.ultimo_latido.getTime(),
      metadata: { ultimoLatido: s.ultimo_latido.toISOString(), umbralMs: UMBRAL_LATIDO_MS },
    })
  }
  await finalizarVencidas(client, filtro, valor)
}

// Entrega automática del servidor: las sesiones en curso que pasaron la hora límite (más la tolerancia) se entregan
// con lo último guardado, con la hora límite como fecha de entrega. Las que esperan el reingreso tienen el tiempo
// detenido y no vencen.
export async function finalizarVencidas(client, filtro, valor) {
  const ahora = new Date()
  const { rows } = await client.query(
    `select s.* from sesiones_examen s
     where s.estado = 'en-curso' and not s.reingreso_pendiente and s.deadline < $2 and ${filtro}
     for update skip locked`,
    [valor, new Date(ahora.getTime() - TOLERANCIA_MS)]
  )
  for (const s of rows) {
    assertTransicion(s.estado, SESION.ENTREGADO_SISTEMA)
    await crearEntrega(client, s, { respuestas: s.respuestas, porTiempo: false, porSistema: true, fechaEntrega: s.deadline })
    await client.query(
      "update sesiones_examen set estado = 'entregado-sistema', fecha_fin = $3, fecha_modificacion = $4 where turno_id = $1 and alumno = $2",
      [s.turno_id, s.alumno, s.deadline, ahora]
    )
    await registrarEvento(client, s, 'TIME_EXPIRED', { actor: 'sistema', ahora, clave: 'fin', metadata: { por: 'sistema' } })
  }
}

// --- Entregas

// Entrega normal (botón Enviar o automática al llegar a cero): en-curso → entregado (o entregado-sistema si llega
// tarde). Idempotente: si ya estaba entregada, no hace nada.
export async function entregar(client, s, { body, ahora, actor }) {
  if (s.estado === SESION.INCIDENTE) throw new HttpError(409, 'El examen fue bloqueado por un incidente.', { codigo: 'incidente' })
  if (s.estado !== SESION.EN_CURSO) return
  if (s.reingreso_pendiente) throw new HttpError(409, 'Volvé a pantalla completa para continuar.', { codigo: 'reingreso' })
  const { enTiempo, respuestas, seq } = respuestasFinales(s, body, ahora)
  const hacia = enTiempo ? SESION.ENTREGADO : SESION.ENTREGADO_SISTEMA
  assertTransicion(s.estado, hacia)
  // El cliente avisa que su cuenta regresiva llegó a cero; solo cuenta si para el servidor el tiempo también se terminó.
  const automatico = Boolean(body.automatico) && ahora.getTime() >= s.deadline.getTime() - TOLERANCIA_MS
  const fechaEntrega = new Date(Math.min(ahora.getTime(), s.deadline.getTime()))
  await crearEntrega(client, s, { respuestas, porTiempo: enTiempo && automatico, porSistema: !enTiempo, fechaEntrega })
  await client.query(
    `update sesiones_examen set estado = $3, respuestas = $4, seq = $5, fecha_fin = $6, pendientes = false, fecha_modificacion = $7
     where turno_id = $1 and alumno = $2 and estado = 'en-curso'`,
    [s.turno_id, s.alumno, hacia, JSON.stringify(respuestas), seq, fechaEntrega, ahora]
  )
  await registrarEvento(client, s, automatico || !enTiempo ? 'TIME_EXPIRED' : 'NORMAL_SUBMISSION', {
    actor, ahora, clave: 'fin', metadata: { por: enTiempo ? 'alumno' : 'sistema' },
  })
}

// Salida voluntaria (botón SALIR, confirmado): en-curso → salio-entrego. Se entrega con lo último guardado (o lo que
// manda el cliente en el mismo pedido) y no se puede reanudar. Idempotente: un segundo pedido no hace nada.
export async function salirVoluntariamente(client, s, { body, ahora, actor, clave, fechaCliente }) {
  if (s.estado === SESION.SALIO_ENTREGO) return
  if (s.estado === SESION.INCIDENTE) throw new HttpError(409, 'El examen ya había sido bloqueado por un incidente.', { codigo: 'incidente' })
  if (s.estado !== SESION.EN_CURSO) throw new HttpError(409, 'El parcial ya fue entregado.', { codigo: 'entregado' })
  if (s.reingreso_pendiente) throw new HttpError(409, 'Volvé a pantalla completa para continuar.', { codigo: 'reingreso' })
  assertTransicion(s.estado, SESION.SALIO_ENTREGO)
  const { enTiempo, respuestas, seq } = respuestasFinales(s, body, ahora)
  const fechaEntrega = new Date(Math.min(ahora.getTime(), s.deadline.getTime()))
  await crearEntrega(client, s, { respuestas, porTiempo: false, porSistema: !enTiempo, fechaEntrega, salidaVoluntaria: true })
  await client.query(
    `update sesiones_examen set estado = 'salio-entrego', respuestas = $3, seq = $4, fecha_fin = $5, pendientes = false,
       fecha_modificacion = $6
     where turno_id = $1 and alumno = $2 and estado = 'en-curso'`,
    [s.turno_id, s.alumno, JSON.stringify(respuestas), seq, fechaEntrega, ahora]
  )
  await registrarEvento(client, s, 'VOLUNTARY_EXIT', {
    actor, ahora, fechaCliente, clave: 'fin', metadata: { restanteMs: Math.max(0, s.deadline.getTime() - ahora.getTime()), clave },
  })
}

// --- Reanudación

// El profesor reanuda un incidente: incidente → en-curso, esperando que el alumno vuelva a pantalla completa
// (recién ahí sigue corriendo el tiempo, desde el que le quedaba). Las respuestas y los eventos anteriores no cambian.
export async function reanudar(client, s, { profesor, ahora, clave }) {
  if (s.estado !== SESION.INCIDENTE) {
    if (clave && (await eventoExiste(client, s.id, `reanudar:${clave}`))) return s // reintento del mismo pedido
    throw new HttpError(409, 'Solo se puede reanudar un examen en Incidente.', { codigo: 'no-incidente' })
  }
  assertTransicion(s.estado, SESION.EN_CURSO)
  const { rows: [nueva] } = await client.query(
    `update sesiones_examen set estado = 'en-curso', reingreso_pendiente = true, reanudaciones = reanudaciones + 1,
       ultimo_latido = $3, fecha_modificacion = $3
     where turno_id = $1 and alumno = $2 and estado = 'incidente' returning *`,
    [s.turno_id, s.alumno, ahora]
  )
  await registrarEvento(client, nueva, 'RESUMED_BY_TEACHER', {
    actor: profesor.username, ahora, clave: clave && `reanudar:${clave}`,
    metadata: {
      profesor: profesor.username, profesorNombre: profesor.nombre, restanteMs: Number(s.restante_ms ?? 0),
      incidenteCausa: s.incidente_causa, reanudacion: nueva.reanudaciones,
    },
  })
  return nueva
}

// El alumno vuelve a pantalla completa después de una reanudación: el tiempo sigue desde el que le quedaba.
// Idempotente: si ya había vuelto, devuelve la sesión como está.
export async function reingresar(client, s, { ahora, actor, fechaCliente }) {
  if (s.estado !== SESION.EN_CURSO) throw new HttpError(409, 'El examen no está habilitado.', { codigo: s.estado })
  if (!s.reingreso_pendiente) return s
  const { rows: [nueva] } = await client.query(
    `update sesiones_examen set reingreso_pendiente = false, deadline = $3, ultimo_latido = $4, fecha_modificacion = $4
     where turno_id = $1 and alumno = $2 and estado = 'en-curso' and reingreso_pendiente returning *`,
    [s.turno_id, s.alumno, new Date(ahora.getTime() + Number(s.restante_ms ?? 0)), ahora]
  )
  await registrarEvento(client, nueva, 'FULLSCREEN_ENTERED', {
    actor, ahora, fechaCliente, clave: `reingreso:${nueva.reanudaciones}`, metadata: { reingreso: true, restanteMs: Number(s.restante_ms ?? 0) },
  })
  return nueva
}
