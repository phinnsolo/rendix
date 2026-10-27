// Configuración de examen de un documento (tema, herramientas permitidas y duración), con valores
// por defecto para los documentos creados antes de que existieran estos campos.

import { DURACION_MAXIMA, HERRAMIENTAS, TITULO_MAXIMO } from './config.js'

// Mensaje de error del título de un parcial, o null si es válido. Lo usan el formulario y la API.
export function validateTitulo(titulo) {
  if (typeof titulo !== 'string' || !titulo.trim()) return 'El título es obligatorio.'
  if (titulo.trim().length > TITULO_MAXIMO) return `El título puede tener hasta ${TITULO_MAXIMO} caracteres.`
  return null
}

export function getTema(doc) {
  return doc?.tema ?? ''
}

export function getHerramientas(doc) {
  const herramientas = {}
  for (const key of Object.keys(HERRAMIENTAS)) {
    herramientas[key] = Boolean(doc?.herramientas?.[key])
  }
  return herramientas
}

// Minutos que tiene el alumno, o null (sin límite) en los parciales anteriores a la duración.
export function getDuracion(doc) {
  return Number.isInteger(doc?.duracion) ? doc.duracion : null
}

export function isValidDuracion(minutos) {
  return Number.isInteger(minutos) && minutos >= 1 && minutos <= DURACION_MAXIMA
}

export function formatDuracion(minutos) {
  return minutos == null ? 'Sin límite de tiempo' : `${minutos} min`
}
