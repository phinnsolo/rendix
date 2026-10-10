import { ALUMNOS, PROFESORES } from './config.js'

// La sesión vive en sessionStorage: cada pestaña tiene la suya, así se puede tener al profesor en una
// y a un alumno en otra. Los datos (parciales, turnos, entregas) siguen en localStorage, compartidos.
const SESSION_KEY = 'rendix_session'

// Alumnos que crearon su cuenta desde el login. TEMPORAL: sin backend, quedan en el localStorage del
// navegador con la contraseña en texto plano. Entran con su usuario o su mail. Las cuentas creadas
// antes de que existiera el campo usuario tienen el mail como usuario.
const ALUMNOS_KEY = 'rendix_alumnos'

const PASSWORD_MINIMA = 6

function alumnosRegistrados() {
  try {
    return JSON.parse(localStorage.getItem(ALUMNOS_KEY)) || []
  } catch {
    return []
  }
}

// Alumnos fijos de config.js y los que se registraron.
export function getAlumnos() {
  return [...ALUMNOS, ...alumnosRegistrados()]
}

function usuarios() {
  return [...PROFESORES, ...getAlumnos()]
}

function iniciarSesion(usuario) {
  const session = { username: usuario.username, nombre: usuario.nombre, rol: usuario.rol }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

// Se puede entrar con el usuario o con el mail, sin distinguir mayúsculas.
export function login(usuarioOMail, password) {
  const buscado = usuarioOMail.toLowerCase()
  const usuario = usuarios().find(
    (u) => (u.username.toLowerCase() === buscado || u.email?.toLowerCase() === buscado) && u.password === password
  )
  return usuario ? iniciarSesion(usuario) : null
}

// Si el texto ya es el usuario o el mail de alguna cuenta (sin distinguir mayúsculas).
function enUso(texto) {
  return usuarios().some((u) => u.username.toLowerCase() === texto || u.email?.toLowerCase() === texto)
}

// Devuelve { campo: mensaje } con los errores; vacío si la cuenta se puede crear.
export function validateRegistro({ nombre, usuario, email, password }) {
  const errores = {}
  const user = usuario.trim().toLowerCase()
  const mail = email.trim().toLowerCase()
  if (!nombre.trim()) errores.nombre = 'El nombre es obligatorio.'
  if (!user) errores.usuario = 'El usuario es obligatorio.'
  else if (!/^[a-z0-9._-]{3,20}$/.test(user)) {
    errores.usuario = 'El usuario tiene que tener de 3 a 20 caracteres: letras, números, punto, guion o guion bajo.'
  } else if (enUso(user)) errores.usuario = 'Ese usuario ya está en uso.'
  if (!mail) errores.email = 'El mail es obligatorio.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) errores.email = 'El mail no es válido.'
  else if (enUso(mail)) errores.email = 'Ya hay una cuenta con ese mail.'
  if (password.length < PASSWORD_MINIMA) errores.password = `La contraseña tiene que tener al menos ${PASSWORD_MINIMA} caracteres.`
  return errores
}

// Crea la cuenta de alumno e inicia la sesión. Validar antes con validateRegistro.
export function registrarAlumno({ nombre, usuario, email, password }) {
  const alumno = {
    username: usuario.trim().toLowerCase(),
    email: email.trim().toLowerCase(),
    nombre: nombre.trim(),
    password,
    rol: 'alumno',
    fechaRegistro: new Date().toISOString(),
  }
  localStorage.setItem(ALUMNOS_KEY, JSON.stringify([...alumnosRegistrados(), alumno]))
  return iniciarSesion(alumno)
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
