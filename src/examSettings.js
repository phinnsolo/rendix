// Configuración de examen de un documento (tema, herramientas permitidas y duración), con valores
// por defecto para los documentos creados antes de que existieran estos campos.

import { DURACION_MAXIMA, HERRAMIENTAS } from './config.js'

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
