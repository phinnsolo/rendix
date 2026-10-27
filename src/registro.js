// Formato de los datos para crear una cuenta de alumno. Lo validan el formulario y la API; que el usuario
// o el mail no estén en uso lo controla solo la API.

export const PASSWORD_MINIMA = 6

// Devuelve { campo: mensaje } con los errores; vacío si el formato es válido.
export function validateRegistro({ nombre, usuario, email, password }) {
  const errores = {}
  const user = String(usuario ?? '').trim().toLowerCase()
  const mail = String(email ?? '').trim().toLowerCase()
  if (!String(nombre ?? '').trim()) errores.nombre = 'El nombre es obligatorio.'
  if (!user) errores.usuario = 'El usuario es obligatorio.'
  else if (!/^[a-z0-9._-]{3,20}$/.test(user)) {
    errores.usuario = 'El usuario tiene que tener de 3 a 20 caracteres: letras, números, punto, guion o guion bajo.'
  }
  if (!mail) errores.email = 'El mail es obligatorio.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) errores.email = 'El mail no es válido.'
  if (String(password ?? '').length < PASSWORD_MINIMA) errores.password = `La contraseña tiene que tener al menos ${PASSWORD_MINIMA} caracteres.`
  return errores
}
