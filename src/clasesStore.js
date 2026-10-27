// Clases que ve el usuario logueado (de getDatos()) y cambios hechos por el dev a través de la API.
// Una clase se dicta siempre el mismo día de la semana y en el mismo turno, con sus profesores y alumnos.

import { request } from './api.js'
import { byDiaYTurno } from './clases.js'
import { getDatos, recargarDatos } from './datos.js'

export { formatDiaTurno, validateClase } from './clases.js'

export function isPredefinida(clase) {
  return Boolean(clase.predefinida)
}

export function getClases() {
  return [...getDatos().clases].sort(byDiaYTurno)
}

export function getClase(id) {
  return getDatos().clases.find((c) => c.id === id) || null
}

// Clases donde el usuario es profesor o alumno.
export function getClasesDe(username) {
  return getClases().filter((c) => c.profesores.includes(username) || c.alumnos.includes(username))
}

// Nombre de la clase de un parcial; los parciales creados antes de las clases no tienen.
export function nombreClase(claseId) {
  return getClase(claseId)?.nombre ?? 'Sin clase'
}

export async function createClase({ nombre, dia, turno, profesores, alumnos }) {
  const { clase } = await request('POST', '/api/clases', { nombre, dia, turno, profesores, alumnos })
  await recargarDatos()
  return clase
}

// Guarda los cambios de una clase. Los alumnos agregados quedan asignados a los parciales de la clase que
// todavía no se tomaron, y los quitados salen de ellos (lo hace el servidor).
export async function updateClase(id, { nombre, dia, turno, profesores, alumnos }) {
  const { clase } = await request('PUT', `/api/clases/${encodeURIComponent(id)}`, { nombre, dia, turno, profesores, alumnos })
  await recargarDatos()
  return clase
}
