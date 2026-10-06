import { PROFESORES } from './config.js'

const SESSION_KEY = 'rendix_session'

export function login(username, password) {
  const profesor = PROFESORES.find(
    (p) => p.username === username && p.password === password
  )
  if (!profesor) return false
  const session = { username: profesor.username, nombre: profesor.nombre }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return true
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY))
  } catch {
    return null
  }
}

export function isLoggedIn() {
  return getSession() !== null
}
