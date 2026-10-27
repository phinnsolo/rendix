// La sesión vive en sessionStorage: cada pestaña tiene la suya, así se puede tener al profesor en una
// y a un alumno en otra. El servidor la valida con el token firmado que devuelve al iniciar sesión.

import { getToken, request, setToken } from './api.js'
import { borrarDatos, getDatos } from './datos.js'

export { validateRegistro } from './registro.js'

const SESSION_KEY = 'rendix_session'

// Alumnos que puede ver el usuario (para asignarlos a clases y turnos).
export function getAlumnos() {
  return getDatos().usuarios.filter((u) => u.rol === 'alumno')
}

export function getProfesores() {
  return getDatos().usuarios.filter((u) => u.rol === 'profesor')
}

// Nombre para mostrar de cualquier usuario; si no se conoce, el propio usuario.
export function nombreDe(username) {
  return getDatos().usuarios.find((u) => u.username === username)?.nombre ?? username
}

function iniciarSesion({ sesion, token }) {
  setToken(token)
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(sesion))
  return sesion
}

// Se puede entrar con el usuario o con el mail, sin distinguir mayúsculas. Devuelve null si no coinciden.
export async function login(usuarioOMail, password) {
  try {
    return iniciarSesion(await request('POST', '/api/login', { usuario: usuarioOMail, password }))
  } catch (e) {
    if (e.status === 401) return null
    throw e
  }
}

// Crea la cuenta de alumno e inicia la sesión. Si el usuario o el mail están en uso, lanza ApiError con `errores`.
export async function registrarAlumno({ nombre, usuario, email, password }) {
  return iniciarSesion(await request('POST', '/api/registro', { nombre, usuario, email, password }))
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY)
  setToken(null)
  borrarDatos()
}

// Sin token (sesiones de antes del servidor) no hay sesión.
export function getSession() {
  if (!getToken()) return null
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY))
  } catch {
    return null
  }
}

export function isLoggedIn() {
  return getSession() !== null
}

export function getRole(session = getSession()) {
  return session?.rol ?? null
}

const HOME = { alumno: '/alumno', dev: '/dev', profesor: '/' }

export function homePath(session = getSession()) {
  return HOME[getRole(session)] ?? '/login'
}
