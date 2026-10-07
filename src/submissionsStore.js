// Único módulo que accede al almacenamiento de entregas.
// Para migrar a una base de datos, reemplazar estas funciones.
// Las entregas se guardan por profesor: rendix_entregas_<profesor>.
// Las respuestas sin enviar, por alumno y parcial: rendix_respuestas_<alumno>_<parcialId>.

import { getSession } from './auth.js'
import { getBlocks } from './documentBlocks.js'
import { getDuracion, getHerramientas, getTema } from './examSettings.js'

function storageKey(profesor) {
  return `rendix_entregas_${profesor}`
}

function readAll(profesor) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(profesor))) || []
  } catch {
    return []
  }
}

function writeAll(profesor, entregas) {
  localStorage.setItem(storageKey(profesor), JSON.stringify(entregas))
}

function draftKey(parcialId) {
  return `rendix_respuestas_${getSession().username}_${parcialId}`
}

function startKey(parcialId) {
  return `rendix_inicio_${getSession().username}_${parcialId}`
}

// --- Alumno

export function getSubmissionOf(profesor, parcialId, alumno) {
  return readAll(profesor).find((e) => e.parcialId === parcialId && e.alumno === alumno) || null
}

// Momento en que el alumno tocó "Comenzar parcial" (ISO), o null si todavía no empezó.
export function getExamStart(parcialId) {
  return localStorage.getItem(startKey(parcialId))
}

export function startExam(parcialId) {
  const inicio = new Date().toISOString()
  localStorage.setItem(startKey(parcialId), inicio)
  return inicio
}

// Guarda la entrega con una copia del parcial: si el profesor lo edita después, la entrega no cambia.
// Cada alumno entrega una sola vez. `automatico` indica que se envió porque se terminó el tiempo.
export function submitExam(doc, respuestas, { automatico = false } = {}) {
  const session = getSession()
  const profesor = session.profesor
  if (getSubmissionOf(profesor, doc.id, session.username)) {
    throw new Error('Este parcial ya fue entregado.')
  }
  const entrega = {
    id: crypto.randomUUID(),
    parcialId: doc.id,
    profesor,
    alumno: session.username,
    alumnoNombre: session.nombre,
    titulo: doc.titulo,
    tema: getTema(doc),
    herramientas: getHerramientas(doc),
    duracion: getDuracion(doc),
    bloques: getBlocks(doc),
    respuestas,
    fechaInicio: getExamStart(doc.id),
    fechaEntrega: new Date().toISOString(),
    enviadoPorTiempo: automatico,
  }
  writeAll(profesor, [...readAll(profesor), entrega])
  localStorage.removeItem(draftKey(doc.id))
  localStorage.removeItem(startKey(doc.id))
  return entrega
}

export function getDraftAnswers(parcialId) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(parcialId)))
  } catch {
    return null
  }
}

export function saveDraftAnswers(parcialId, respuestas) {
  try {
    localStorage.setItem(draftKey(parcialId), JSON.stringify(respuestas))
  } catch {
    // Sin espacio: el progreso no se guarda, pero se puede seguir respondiendo y enviar.
  }
}

// --- Profesor (usa la clave de su propia sesión)

export function entregasLabel(n) {
  return n === 1 ? '1 entrega' : `${n} entregas`
}

export function getSubmissionsFor(parcialId) {
  return readAll(getSession().username)
    .filter((e) => e.parcialId === parcialId)
    .sort((a, b) => b.fechaEntrega.localeCompare(a.fechaEntrega))
}

export function getSubmission(id) {
  return readAll(getSession().username).find((e) => e.id === id) || null
}

// Todas las entregas de los parciales del profesor, de la más nueva a la más vieja.
export function getAllSubmissions() {
  return readAll(getSession().username).sort((a, b) => b.fechaEntrega.localeCompare(a.fechaEntrega))
}

export function isGraded(entrega) {
  return entrega?.correccion != null
}

// Nota (0 a 10) y devolución del profesor. Se puede volver a guardar para cambiarla.
export function gradeSubmission(id, { nota, comentario }) {
  const profesor = getSession().username
  let updated = null
  writeAll(
    profesor,
    readAll(profesor).map((e) => {
      if (e.id !== id) return e
      updated = { ...e, correccion: { nota, comentario, fecha: new Date().toISOString() } }
      return updated
    })
  )
  window.dispatchEvent(new Event(CORRECCION_EVENT))
  return updated
}

// Avisa que cambió una corrección (lo usa el contador de "sin corregir" del header).
export const CORRECCION_EVENT = 'rendix:correccion'

export function deleteSubmissionsFor(parcialId) {
  const profesor = getSession().username
  writeAll(profesor, readAll(profesor).filter((e) => e.parcialId !== parcialId))
}
