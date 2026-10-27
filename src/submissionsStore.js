// Entregas que ve el usuario logueado (de getDatos()): el profesor, las de sus parciales; el alumno, las suyas.
// Cada entrega guarda una copia del parcial: si el profesor lo edita después, la entrega no cambia.
// `enviadoPorTiempo`: se envió sola al llegar a cero; `enviadoPorSistema`: la entregó el servidor con lo último
// guardado porque el alumno estaba desconectado al vencer el tiempo.

import { request } from './api.js'
import { getDatos, recargarDatos } from './datos.js'

function byFechaEntrega(a, b) {
  return b.fechaEntrega.localeCompare(a.fechaEntrega)
}

// --- Alumno

export function getSubmissionOf(profesor, parcialId, alumno) {
  return getDatos().entregas.find((e) => e.parcialId === parcialId && e.alumno === alumno && e.profesor === profesor) || null
}

// --- Profesor

export function entregasLabel(n) {
  return n === 1 ? '1 entrega' : `${n} entregas`
}

export function getSubmissionsFor(parcialId) {
  return getDatos().entregas.filter((e) => e.parcialId === parcialId).sort(byFechaEntrega)
}

export function getSubmission(id) {
  return getDatos().entregas.find((e) => e.id === id) || null
}

// Todas las entregas de los parciales del profesor, de la más nueva a la más vieja.
export function getAllSubmissions() {
  return [...getDatos().entregas].sort(byFechaEntrega)
}

export function isGraded(entrega) {
  return entrega?.correccion != null
}

// Nota (0 a 10) y devolución del profesor. Se puede volver a guardar para cambiarla.
export async function gradeSubmission(id, { nota, comentario }) {
  const { entrega } = await request('PUT', `/api/entregas/${id}/correccion`, { nota, comentario })
  await recargarDatos()
  return entrega
}
