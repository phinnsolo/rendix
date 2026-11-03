// Registro de incidentes del modo restringido desde el navegador.
//
// triggerExamIncident manda el incidente al servidor junto con las últimas respuestas (flush inmediato), una sola
// vez por sesión aunque lo pidan varias señales o React lo llame dos veces (Strict Mode). Si no hay conexión, el
// evento queda en una cola local y se manda al volver la red con la misma clave, así el servidor no lo duplica.
// La cola no reemplaza al latido: el servidor también detecta la pérdida de señal por su cuenta.

import { request } from './api.js'

const KEEPALIVE_MAX = 60_000 // fetch keepalive no acepta cuerpos de más de 64 KB

export function nuevoEventoId() {
  return globalThis.crypto?.randomUUID?.() ?? `ev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

// --- Cola local de eventos que no llegaron al servidor

const colaKey = (alumno) => `rendix_eventos_pendientes_${alumno}`

export function leerCola(alumno) {
  try {
    const cola = JSON.parse(localStorage.getItem(colaKey(alumno)))
    return Array.isArray(cola) ? cola : []
  } catch {
    return []
  }
}

function escribirCola(alumno, cola) {
  try {
    if (cola.length === 0) localStorage.removeItem(colaKey(alumno))
    else localStorage.setItem(colaKey(alumno), JSON.stringify(cola))
  } catch {
    // Sin almacenamiento: queda el latido, que el servidor controla igual.
  }
}

function encolar(alumno, evento) {
  const cola = leerCola(alumno).filter((e) => e.body.eventoId !== evento.body.eventoId)
  escribirCola(alumno, [...cola, evento])
}

let sincronizando = null

// Manda los eventos pendientes (en orden). Se detiene en el primero que no llega por falta de conexión.
export function sincronizarPendientes(alumno) {
  if (sincronizando) return sincronizando
  if (leerCola(alumno).length === 0) return Promise.resolve()
  const promesa = (async () => {
    for (const evento of leerCola(alumno)) {
      try {
        await request('POST', `/api/examen/${evento.parcialId}/incidente`, { ...evento.body, diferido: true })
      } catch (e) {
        if (e.sinConexion) return
      }
      escribirCola(alumno, leerCola(alumno).filter((x) => x.body.eventoId !== evento.body.eventoId))
    }
  })()
  sincronizando = promesa.finally(() => {
    sincronizando = null
  })
  return sincronizando
}

// --- Incidente

const disparados = new Map() // sesionKey → promesa del reporte

// `sesionKey` identifica la sesión y su reanudación (un incidente por tramo). Devuelve el estado de la sesión que
// contesta el servidor ({ estado, ... }) o null si quedó en la cola sin conexión.
export function triggerExamIncident({ parcialId, alumno, sesionKey, causa, senales = [], respuestas, seq, urgente = false }) {
  if (disparados.has(sesionKey)) return disparados.get(sesionKey)
  const body = {
    eventoId: nuevoEventoId(),
    causa,
    senales: senales.map(({ tipo, fechaCliente }) => ({ tipo, fechaCliente })),
    fechaCliente: Date.now(),
    respuestas,
    seq,
  }
  const promesa = (async () => {
    // Si la página se está cerrando, keepalive deja que el pedido termine. Su límite de tamaño obliga a mandar sin
    // respuestas cuando son grandes (ej. GeoGebra): las ya guardadas no se pierden y la copia local sigue en el equipo.
    let cuerpo = body
    let keepalive = false
    if (urgente) {
      keepalive = true
      if (JSON.stringify(body).length > KEEPALIVE_MAX) cuerpo = { ...body, respuestas: undefined, seq: undefined }
    }
    try {
      return await request('POST', `/api/examen/${parcialId}/incidente`, cuerpo, { keepalive })
    } catch (e) {
      if (!e.sinConexion) return null
      encolar(alumno, { parcialId, body })
      return null
    }
  })()
  disparados.set(sesionKey, promesa)
  return promesa
}

// Solo para pruebas.
export function _reiniciarIncidentes() {
  disparados.clear()
}
