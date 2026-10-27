// Datos que el usuario logueado puede ver (GET /api/datos), guardados en memoria. Los stores los leen de acá
// de forma síncrona; después de cada cambio se vuelven a pedir. El Layout los recarga al navegar, al volver
// a la pestaña y cada 30 s, así se ven los cambios hechos desde otros dispositivos.

import { useSyncExternalStore } from 'react'
import { request } from './api.js'

const VACIO = { usuarios: [], clases: [], documentos: [], turnos: [], entregas: [] }

let datos = null
let pedido = null
const oyentes = new Set()

function avisar() {
  for (const oyente of oyentes) oyente()
}

export function getDatos() {
  return datos ?? VACIO
}

export function hayDatos() {
  return datos !== null
}

// Pide los datos de nuevo. Si ya hay un pedido en curso, se espera ese.
export function recargarDatos() {
  pedido ??= request('GET', '/api/datos')
    .then(({ serverNow: _serverNow, ...nuevos }) => {
      datos = nuevos
      avisar()
    })
    .finally(() => {
      pedido = null
    })
  return pedido
}

export function borrarDatos() {
  datos = null
  avisar()
}

function suscribir(oyente) {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

// Re-renderiza el componente cada vez que llegan datos nuevos.
export function useDatos() {
  return useSyncExternalStore(suscribir, getDatos)
}
