// Contraseñas hasheadas con scrypt y tokens de sesión firmados con HMAC (AUTH_SECRET).
// El token viaja en el header Authorization y el cliente lo guarda por pestaña (sessionStorage).
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const DURACION_TOKEN_MS = 12 * 60 * 60 * 1000

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = await scryptAsync(password, salt, 64)
  return `${salt}:${hash.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(':')
  const hash = await scryptAsync(password, salt, 64)
  const esperado = Buffer.from(hex, 'hex')
  return esperado.length === hash.length && timingSafeEqual(esperado, hash)
}

function secret() {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('Falta la variable de entorno AUTH_SECRET.')
  return s
}

function firmar(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function crearToken({ username, nombre, rol }) {
  const payload = Buffer.from(JSON.stringify({ username, nombre, rol, exp: Date.now() + DURACION_TOKEN_MS })).toString('base64url')
  return `${payload}.${firmar(payload)}`
}

// Devuelve la sesión { username, nombre, rol } o null si el token no es válido o venció.
export function leerToken(token) {
  const [payload, firma] = String(token ?? '').split('.')
  if (!payload || !firma) return null
  const esperada = Buffer.from(firmar(payload))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null
  try {
    const sesion = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return sesion.exp > Date.now() ? { username: sesion.username, nombre: sesion.nombre, rol: sesion.rol } : null
  } catch {
    return null
  }
}
