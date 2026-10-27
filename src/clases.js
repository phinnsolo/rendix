// Reglas de las clases, sin acceso a datos: las usan el frontend (clasesStore.js) y la API.
// Una clase se dicta siempre el mismo día de la semana y en el mismo turno, con sus profesores y alumnos.

import { DIAS, TURNOS } from './config.js'

const ORDEN_DIAS = Object.keys(DIAS)
const ORDEN_TURNOS = Object.keys(TURNOS)

export function byDiaYTurno(a, b) {
  return (
    ORDEN_DIAS.indexOf(a.dia) - ORDEN_DIAS.indexOf(b.dia) ||
    ORDEN_TURNOS.indexOf(a.turno) - ORDEN_TURNOS.indexOf(b.turno) ||
    a.nombre.localeCompare(b.nombre, 'es')
  )
}

export function formatDiaTurno(clase) {
  const turno = TURNOS[clase.turno]
  return `${DIAS[clase.dia]} · ${turno.nombre} (${turno.inicio} a ${turno.fin})`
}

// Devuelve { campo: mensaje } con los errores; vacío si la clase se puede guardar.
export function validateClase({ nombre, dia, turno, profesores, alumnos }) {
  const errores = {}
  if (typeof nombre !== 'string' || !nombre.trim()) errores.nombre = 'El nombre es obligatorio.'
  if (!DIAS[dia]) errores.dia = 'Elegí un día.'
  if (!TURNOS[turno]) errores.turno = 'Elegí un turno.'
  if (!Array.isArray(profesores) || profesores.length === 0) errores.profesores = 'Asigná al menos un profesor.'
  if (!Array.isArray(alumnos) || alumnos.length === 0) errores.alumnos = 'Asigná al menos un alumno.'
  return errores
}
