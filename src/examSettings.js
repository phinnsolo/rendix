// Configuración de examen de un documento (tema y herramientas permitidas), con valores
// por defecto para los documentos creados antes de que existieran estos campos.

import { HERRAMIENTAS } from './config.js'

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
