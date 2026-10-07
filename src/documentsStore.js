// Único módulo que accede al almacenamiento de documentos (parciales).
// Para migrar a una base de datos, reemplazar estas funciones.
// Cada profesor tiene su propia clave: rendix_documents_<username>.

import { getSession } from './auth.js'
import { textFromBlocks } from './documentBlocks.js'
import { deleteSubmissionsFor } from './submissionsStore.js'

export const ESTADOS = { borrador: 'borrador', publicado: 'publicado' }

function storageKey(username = getSession().username) {
  return `rendix_documents_${username}`
}

function readAll(username) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(username))) || []
  } catch {
    return []
  }
}

function writeAll(documents) {
  localStorage.setItem(storageKey(), JSON.stringify(documents))
}

function byFechaModificacion(a, b) {
  return b.fechaModificacion.localeCompare(a.fechaModificacion)
}

// Los documentos creados antes de que existiera el estado se consideran borradores.
export function isPublished(doc) {
  return doc?.estado === ESTADOS.publicado
}

export function getDocuments() {
  return readAll().sort(byFechaModificacion)
}

export function getDocument(id) {
  return readAll().find((doc) => doc.id === id) || null
}

// Parciales publicados de un profesor, para la vista del alumno. Nunca devuelve borradores.
export function getPublishedDocumentsOf(profesor) {
  return readAll(profesor)
    .filter((doc) => isPublished(doc) && (doc.profesor ?? profesor) === profesor)
    .sort((a, b) => b.fechaPublicacion.localeCompare(a.fechaPublicacion))
}

export function getPublishedDocumentOf(profesor, id) {
  return getPublishedDocumentsOf(profesor).find((doc) => doc.id === id) || null
}

export function createDocument({ titulo, tema, herramientas, bloques }) {
  const ahora = new Date().toISOString()
  const doc = {
    id: crypto.randomUUID(),
    profesor: getSession().username,
    estado: ESTADOS.borrador,
    titulo,
    tema,
    herramientas,
    contenido: textFromBlocks(bloques),
    bloques,
    fechaCreacion: ahora,
    fechaModificacion: ahora,
  }
  writeAll([...readAll(), doc])
  return doc
}

export function updateDocument(id, { titulo, tema, herramientas, bloques }) {
  let updated = null
  const documents = readAll().map((doc) => {
    if (doc.id !== id) return doc
    updated = {
      ...doc,
      titulo,
      tema,
      herramientas,
      contenido: textFromBlocks(bloques),
      bloques,
      fechaModificacion: new Date().toISOString(),
    }
    return updated
  })
  writeAll(documents)
  return updated
}

export function publishDocument(id) {
  const username = getSession().username
  writeAll(
    readAll().map((doc) =>
      doc.id === id
        ? { ...doc, profesor: doc.profesor ?? username, estado: ESTADOS.publicado, fechaPublicacion: new Date().toISOString() }
        : doc
    )
  )
}

export function deleteDocument(id) {
  writeAll(readAll().filter((doc) => doc.id !== id))
  deleteSubmissionsFor(id)
}
