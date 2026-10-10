// Único módulo que accede al almacenamiento de clases.
// Para migrar a una base de datos, reemplazar estas funciones.
// Las clases predefinidas vienen de config.js (CLASES); las que crea el dev se guardan en rendix_clases.
// Si el dev edita una predefinida, la copia editada se guarda ahí con el mismo id y reemplaza a la original.
// Una clase se dicta siempre el mismo día de la semana y en el mismo turno, con sus profesores y alumnos.

import { CLASES, DIAS, TURNOS } from './config.js'
import { getDocumentIdsDeClase } from './documentsStore.js'
import { actualizarAlumnosDeParcial } from './turnosStore.js'

const STORAGE_KEY = 'rendix_clases'

function readCreadas() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

const ORDEN_DIAS = Object.keys(DIAS)
const ORDEN_TURNOS = Object.keys(TURNOS)

function byDiaYTurno(a, b) {
  return (
    ORDEN_DIAS.indexOf(a.dia) - ORDEN_DIAS.indexOf(b.dia) ||
    ORDEN_TURNOS.indexOf(a.turno) - ORDEN_TURNOS.indexOf(b.turno) ||
    a.nombre.localeCompare(b.nombre, 'es')
  )
}

export function isPredefinida(clase) {
  return CLASES.some((c) => c.id === clase.id)
}

export function getClases() {
  const guardadas = readCreadas()
  return [...CLASES.filter((c) => !guardadas.some((g) => g.id === c.id)), ...guardadas].sort(byDiaYTurno)
}

export function getClase(id) {
  return getClases().find((c) => c.id === id) || null
}

// Clases donde el usuario es profesor o alumno.
export function getClasesDe(username) {
  return getClases().filter((c) => c.profesores.includes(username) || c.alumnos.includes(username))
}

// Nombre de la clase de un parcial; los parciales creados antes de las clases no tienen.
export function nombreClase(claseId) {
  return getClase(claseId)?.nombre ?? 'Sin clase'
}

export function formatDiaTurno(clase) {
  const turno = TURNOS[clase.turno]
  return `${DIAS[clase.dia]} · ${turno.nombre} (${turno.inicio} a ${turno.fin})`
}

// Devuelve { campo: mensaje } con los errores; vacío si la clase se puede guardar.
export function validateClase({ nombre, dia, turno, profesores, alumnos }) {
  const errores = {}
  if (!nombre.trim()) errores.nombre = 'El nombre es obligatorio.'
  if (!DIAS[dia]) errores.dia = 'Elegí un día.'
  if (!TURNOS[turno]) errores.turno = 'Elegí un turno.'
  if (profesores.length === 0) errores.profesores = 'Asigná al menos un profesor.'
  if (alumnos.length === 0) errores.alumnos = 'Asigná al menos un alumno.'
  return errores
}

export function createClase({ nombre, dia, turno, profesores, alumnos }) {
  const clase = {
    id: crypto.randomUUID(),
    nombre: nombre.trim(),
    dia,
    turno,
    profesores,
    alumnos,
    fechaCreacion: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...readCreadas(), clase]))
  return clase
}

// Guarda los cambios de una clase. Los alumnos agregados quedan asignados a los parciales de la clase que
// todavía no se tomaron, y los quitados salen de ellos.
export function updateClase(id, { nombre, dia, turno, profesores, alumnos }) {
  const anterior = getClase(id)
  if (!anterior) throw new Error('La clase no existe.')
  const clase = { ...anterior, nombre: nombre.trim(), dia, turno, profesores, alumnos, fechaModificacion: new Date().toISOString() }
  const guardadas = readCreadas()
  const nuevas = guardadas.some((c) => c.id === id) ? guardadas.map((c) => (c.id === id ? clase : c)) : [...guardadas, clase]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevas))

  const agregados = alumnos.filter((a) => !anterior.alumnos.includes(a))
  const quitados = anterior.alumnos.filter((a) => !alumnos.includes(a))
  if (agregados.length > 0 || quitados.length > 0) {
    for (const profesor of new Set([...anterior.profesores, ...profesores])) {
      for (const parcialId of getDocumentIdsDeClase(profesor, id)) {
        actualizarAlumnosDeParcial(profesor, parcialId, agregados, quitados)
      }
    }
  }
  return clase
}
