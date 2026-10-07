// Único módulo que accede al almacenamiento de documentos.
// Para migrar a una base de datos, reemplazar estas funciones.
// Cada profesor tiene su propia clave: rendix_documents_<username>.

import { getSession } from './auth.js'
import { textFromBlocks } from './documentBlocks.js'

function storageKey() {
  return `rendix_documents_${getSession().username}`
}

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(storageKey())) || []
  } catch {
    return []
  }
}

function writeAll(documents) {
  localStorage.setItem(storageKey(), JSON.stringify(documents))
}

export function getDocuments() {
  return readAll().sort((a, b) => b.fechaModificacion.localeCompare(a.fechaModificacion))
}

export function getDocument(id) {
  return readAll().find((doc) => doc.id === id) || null
}

export function createDocument({ titulo, tema, herramientas, bloques }) {
  const ahora = new Date().toISOString()
  const doc = {
    id: crypto.randomUUID(),
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

export function deleteDocument(id) {
  writeAll(readAll().filter((doc) => doc.id !== id))
}
