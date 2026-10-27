// Pedidos a la API. Agrega el token de la sesión, sincroniza el reloj con `serverNow` y convierte los errores
// en ApiError con un mensaje para mostrar.

import { syncClock } from './clock.js'

const TOKEN_KEY = 'rendix_token'

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
  else sessionStorage.removeItem(TOKEN_KEY)
}

// `sinConexion`: no llegó al servidor (red caída o servidor inaccesible). `status`/`codigo`/`errores` vienen
// de la respuesta.
export class ApiError extends Error {
  constructor(mensaje, { status = 0, codigo = null, errores = null } = {}) {
    super(mensaje)
    this.status = status
    this.codigo = codigo
    this.errores = errores
    this.sinConexion = status === 0
  }
}

// Si el servidor rechaza el token (venció), se avisa para volver al login.
export const SESION_VENCIDA_EVENT = 'rendix:sesion-vencida'

export async function request(method, path, body, { keepalive = false } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const t0 = performance.now()
  let res
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), keepalive, cache: 'no-store' })
  } catch {
    throw new ApiError('No hay conexión con el servidor.')
  }
  const t1 = performance.now()
  let datos = {}
  try {
    datos = await res.json()
  } catch {
    if (!res.ok) throw new ApiError('No hay conexión con el servidor.', { status: res.status >= 500 ? 0 : res.status })
  }
  if (typeof datos.serverNow === 'number') syncClock(datos.serverNow, t0, t1)
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event(SESION_VENCIDA_EVENT))
    throw new ApiError(datos.error ?? 'Error del servidor. Probá de nuevo.', {
      // Un 5xx de la plataforma (función caída) cuenta como sin conexión: se reintenta.
      status: res.status >= 502 ? 0 : res.status,
      codigo: datos.codigo ?? null,
      errores: datos.errores ?? null,
    })
  }
  return datos
}
