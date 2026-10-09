import { ALUMNOS, PROFESORES } from './config.js'

// La sesión vive en sessionStorage: cada pestaña tiene la suya, así se puede tener al profesor en una
// y a un alumno en otra. Los datos (parciales, turnos, entregas) siguen en localStorage, compartidos.
const SESSION_KEY = 'rendix_session'

export function login(username, password) {
  const usuario = [...PROFESORES, ...ALUMNOS].find(
    (u) => u.username === username && u.password === password
  )
  if (!usuario) return null
  const session = { username: usuario.username, nombre: usuario.nombre, rol: usuario.rol }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY)
}

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY))
  } catch {
    return null
  }
}

export function isLoggedIn() {
  return getSession() !== null
}

// Las sesiones guardadas antes de que existieran los alumnos no tienen rol: eran de profesor.
export function getRole(session = getSession()) {
  return session?.rol ?? 'profesor'
}

export function homePath(session = getSession()) {
  return getRole(session) === 'alumno' ? '/alumno' : '/'
}
