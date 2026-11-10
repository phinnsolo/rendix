// Autoguardado, latido y cuenta regresiva de un alumno resolviendo un parcial.
//
// Cada cambio se escribe enseguida en una copia local (localStorage, síncrona: sobrevive a un cierre o un corte
// de luz) y, 300 ms después de la última interacción, se manda al servidor. Cada cambio sube `seq`; el servidor
// descarta lo que llega fuera de orden. Sin conexión se reintenta cada segundo y apenas vuelve la red.
// El latido (cada 2 s) le avisa al profesor que el alumno sigue conectado y si tiene cambios sin subir. Si el
// servidor deja de recibirlo, marca la sesión como Incidente (modo restringido); si el navegador no recibe
// respuesta durante UMBRAL_SIN_SENAL_MS, avisa con onSinSenal para bloquear el examen también de este lado.

import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from './api.js'
import { now } from './clock.js'
import { LATIDO_MS } from './estadoExamen.js'

const ESPERA_GUARDADO_MS = 300
const REINTENTO_MS = 1000
export const UMBRAL_SIN_SENAL_MS = 10_000
const KEEPALIVE_MAX = 60_000 // fetch keepalive no acepta cuerpos de más de 64 KB

function cacheKey(alumno, parcialId) {
  return `rendix_cache_${alumno}_${parcialId}`
}

function leerCache(alumno, parcialId) {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(alumno, parcialId)))
  } catch {
    return null
  }
}

// Devuelve false si no se pudo escribir (almacenamiento lleno o bloqueado).
function escribirCache(alumno, parcialId, respuestas, seq) {
  try {
    localStorage.setItem(cacheKey(alumno, parcialId), JSON.stringify({ respuestas, seq }))
    return true
  } catch {
    // Sin espacio: queda solo lo que ya llegó al servidor, y se sigue intentando subir.
    return false
  }
}

export function borrarCache(alumno, parcialId) {
  try {
    localStorage.removeItem(cacheKey(alumno, parcialId))
  } catch {
    // Sin acceso al almacenamiento: no hay nada que borrar.
  }
}

// Punto de partida: lo guardado en el servidor o, si la copia local es más nueva (cambios que no llegaron a
// subirse antes de cerrar o perder la conexión), la copia local.
export function respuestasIniciales(alumno, parcialId, sesion) {
  const cache = leerCache(alumno, parcialId)
  if (cache && Number.isSafeInteger(cache.seq) && cache.seq > sesion.seq) {
    return { respuestas: cache.respuestas ?? {}, seq: cache.seq }
  }
  borrarCache(alumno, parcialId)
  return { respuestas: sesion.respuestas ?? {}, seq: sesion.seq }
}

// `estado`: 'guardado' | 'guardando' | 'sin-conexion' | 'sin-copia' (sin conexión y sin copia local: lo último
// escrito solo está en la pantalla). `onCerrado` se llama si el servidor avisa que la sesión
// ya no está en curso (se entregó, venció o quedó en Incidente).
export function useAutosave({ alumno, parcialId, inicial, serverSeq, bloqueado, onCerrado, onSinSenal }) {
  const [respuestas, setRespuestas] = useState(inicial.respuestas)
  const respRef = useRef(inicial.respuestas)
  const seqRef = useRef(inicial.seq)
  const subidoRef = useRef(serverSeq)
  const enVuelo = useRef(false)
  const timer = useRef(null)
  const [conectado, setConectado] = useState(true)
  const [pendiente, setPendiente] = useState(inicial.seq > serverSeq)
  const [copiaLocal, setCopiaLocal] = useState(true)
  const bloqueadoRef = useRef(bloqueado)
  bloqueadoRef.current = bloqueado
  const onCerradoRef = useRef(onCerrado)
  onCerradoRef.current = onCerrado
  const onSinSenalRef = useRef(onSinSenal)
  onSinSenalRef.current = onSinSenal

  const programar = useCallback((ms) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => flushRef.current(), ms)
  }, [])

  const flush = useCallback(async ({ keepalive = false } = {}) => {
    if (enVuelo.current || bloqueadoRef.current || seqRef.current <= subidoRef.current) return
    enVuelo.current = true
    const seq = seqRef.current
    const cuerpo = { respuestas: respRef.current, seq }
    try {
      const usarKeepalive = keepalive && JSON.stringify(cuerpo).length < KEEPALIVE_MAX
      await request('PUT', `/api/examen/${parcialId}/respuestas`, cuerpo, { keepalive: usarKeepalive })
      subidoRef.current = Math.max(subidoRef.current, seq)
      setConectado(true)
      if (seqRef.current > subidoRef.current) {
        programar(0)
      } else {
        setPendiente(false)
        borrarCache(alumno, parcialId)
      }
    } catch (e) {
      if (['entregado', 'vencido', 'incidente', 'reingreso'].includes(e.codigo)) {
        onCerradoRef.current()
      } else {
        setConectado(!e.sinConexion)
        programar(e.sinConexion ? REINTENTO_MS : REINTENTO_MS * 3)
      }
    } finally {
      enVuelo.current = false
    }
  }, [alumno, parcialId, programar])
  const flushRef = useRef(flush)
  flushRef.current = flush

  const cambiar = useCallback((blockId, valor) => {
    if (bloqueadoRef.current) return
    const nuevas = { ...respRef.current, [blockId]: valor }
    respRef.current = nuevas
    seqRef.current += 1
    setCopiaLocal(escribirCache(alumno, parcialId, nuevas, seqRef.current))
    setRespuestas(nuevas)
    setPendiente(true)
    programar(ESPERA_GUARDADO_MS)
  }, [alumno, parcialId, programar])

  // Si había cambios de la copia local sin subir, se suben al empezar.
  useEffect(() => {
    flushRef.current()
    return () => clearTimeout(timer.current)
  }, [])

  // Al volver la red, subir enseguida. Al salir de la pestaña o cerrarla, intentar subir lo último.
  useEffect(() => {
    const alVolver = () => flushRef.current()
    const alSalir = () => {
      if (document.visibilityState === 'hidden') flushRef.current({ keepalive: true })
    }
    const alCerrar = () => flushRef.current({ keepalive: true })
    window.addEventListener('online', alVolver)
    document.addEventListener('visibilitychange', alSalir)
    window.addEventListener('pagehide', alCerrar)
    return () => {
      window.removeEventListener('online', alVolver)
      document.removeEventListener('visibilitychange', alSalir)
      window.removeEventListener('pagehide', alCerrar)
    }
  }, [])

  // Latido: también re-sincroniza la hora con el servidor. Un solo pedido a la vez: si uno tarda, no se acumulan.
  useEffect(() => {
    if (bloqueado) return
    let enVueloLatido = false
    let ultimaRespuesta = performance.now()
    async function latir() {
      if (performance.now() - ultimaRespuesta > UMBRAL_SIN_SENAL_MS) onSinSenalRef.current?.()
      if (enVueloLatido) return
      enVueloLatido = true
      try {
        const { estado, reingresoPendiente } = await request('POST', `/api/examen/${parcialId}/latido`, { pendientes: seqRef.current > subidoRef.current })
        ultimaRespuesta = performance.now()
        setConectado(true)
        if (estado !== 'en-curso' || reingresoPendiente) onCerradoRef.current()
        else flushRef.current()
      } catch (e) {
        if (e.sinConexion) setConectado(false)
        else ultimaRespuesta = performance.now()
      } finally {
        enVueloLatido = false
      }
    }
    latir()
    const id = setInterval(latir, LATIDO_MS)
    return () => clearInterval(id)
  }, [bloqueado, parcialId])

  const estado = !conectado ? (pendiente && !copiaLocal ? 'sin-copia' : 'sin-conexion') : pendiente ? 'guardando' : 'guardado'
  return { respuestas, respRef, seqRef, cambiar, estado }
}

// Milisegundos que faltan para `deadline` (ISO) según la hora del servidor, actualizado 4 veces por segundo.
export function useRestante(deadline) {
  const limite = Date.parse(deadline)
  const [restante, setRestante] = useState(() => Math.max(0, limite - now()))
  useEffect(() => {
    const id = setInterval(() => setRestante(Math.max(0, limite - now())), 250)
    return () => clearInterval(id)
  }, [limite])
  return restante
}
