// Parciales que ve el usuario logueado (de getDatos()) y cambios a través de la API.
// El profesor ve los suyos; el alumno, los publicados de sus turnos (sin las respuestas correctas).

import { request } from './api.js'
import { getDatos, recargarDatos } from './datos.js'

export const ESTADOS = { borrador: 'borrador', publicado: 'publicado' }

function byFechaModificacion(a, b) {
  return b.fechaModificacion.localeCompare(a.fechaModificacion)
}

export function isPublished(doc) {
  return doc?.estado === ESTADOS.publicado
}

export function getDocuments() {
  return [...getDatos().documentos].sort(byFechaModificacion)
}

export function getDocument(id) {
  return getDatos().documentos.find((doc) => doc.id === id) || null
}

// Parciales publicados de un profesor, para la vista del alumno. Nunca devuelve borradores.
export function getPublishedDocumentsOf(profesor) {
  return getDatos()
    .documentos.filter((doc) => isPublished(doc) && doc.profesor === profesor)
    .sort((a, b) => b.fechaPublicacion.localeCompare(a.fechaPublicacion))
}

export function getPublishedDocumentOf(profesor, id) {
  return getPublishedDocumentsOf(profesor).find((doc) => doc.id === id) || null
}

// Parciales del profesor logueado en una clase.
export function getDocumentsDeClase(claseId) {
  return getDocuments().filter((doc) => doc.claseId === claseId)
}

// Parciales publicados de una clase, de todos sus profesores. Para la vista del alumno.
export function getPublishedDocumentsDeClase(clase) {
  return clase.profesores.flatMap(getPublishedDocumentsOf).filter((doc) => doc.claseId === clase.id)
}

// Crea el parcial con sus turnos (`horarios`, ver turnosStore). Los alumnos de la clase quedan asignados al
// primer turno.
export async function createDocument({ claseId, titulo, tema, herramientas, duracion, bloques, horarios }) {
  const { documento } = await request('POST', '/api/documentos', { claseId, titulo, tema, herramientas, duracion, bloques, horarios })
  await recargarDatos()
  return documento
}

export async function updateDocument(id, { claseId, titulo, tema, herramientas, duracion, bloques, horarios }) {
  const { documento } = await request('PUT', `/api/documentos/${id}`, { claseId, titulo, tema, herramientas, duracion, bloques, horarios })
  await recargarDatos()
  return documento
}

export async function publishDocument(id) {
  await request('POST', `/api/documentos/${id}/publicar`)
  await recargarDatos()
}

// También se borran sus turnos, sesiones y entregas.
export async function deleteDocument(id) {
  await request('DELETE', `/api/documentos/${id}`)
  await recargarDatos()
}
