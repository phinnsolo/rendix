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

// Corregida = nota publicada (el alumno ya la ve). Hasta entonces, la entrega está "por revisar" (Sprint final).
export function isGraded(entrega) {
  return entrega?.estadoCorreccion === 'publicado'
}

// Tiene corrección por pregunta (agentes jueces). Las entregas anteriores a este sprint no.
export function tieneEvaluaciones(entrega) {
  return (entrega?.resumenCorreccion?.total ?? 0) > 0
}

// Alertas de la corrección automática de una entrega, para chips y listas.
export function alertasDe(entrega) {
  const r = entrega?.resumenCorreccion
  if (!r) return { errores: 0, manuales: 0, bajaConfianza: 0, vacias: 0, sinPuntaje: 0 }
  return { errores: r.errores, manuales: r.manuales, bajaConfianza: r.bajaConfianza, vacias: r.vacias, sinPuntaje: r.sinPuntaje }
}

// Lista para publicar: todas las preguntas tienen puntaje definitivo (o, sin corrección por pregunta, tiene nota).
export function listaParaPublicar(entrega) {
  if (!entrega || isGraded(entrega)) return false
  if (tieneEvaluaciones(entrega)) return entrega.resumenCorreccion.sinPuntaje === 0
  return entrega.correccion?.nota != null
}

// --- Corrección automática, revisión y publicación (profesor)

export function getRevision(entregaId) {
  return request('GET', `/api/entregas/${entregaId}/revision`)
}

// Ajuste docente de una pregunta: { puntaje?, feedback? }. Devuelve { evaluacion, entrega } con la nota recalculada.
export async function ajustarEvaluacion(entregaId, bloqueId, cambios) {
  const resultado = await request('PUT', `/api/entregas/${entregaId}/evaluaciones/${encodeURIComponent(bloqueId)}`, cambios)
  recargarDatos().catch(() => {})
  return resultado
}

export async function reevaluarEntrega(entregaId) {
  const resultado = await request('POST', `/api/entregas/${entregaId}/reevaluar`)
  recargarDatos().catch(() => {})
  return resultado
}

export async function publicarEntrega(entregaId) {
  const resultado = await request('POST', `/api/entregas/${entregaId}/publicar`)
  await recargarDatos()
  return resultado
}

export function getCorreccionTurno(turnoId) {
  return request('GET', `/api/turnos/${turnoId}/correccion`)
}

// Publica todas las entregas listas del turno: { publicadas, yaPublicadas, pendientes: [{ alumnoNombre, motivo }] }.
export async function publicarTurno(turnoId) {
  const resultado = await request('POST', `/api/turnos/${turnoId}/publicar`)
  await recargarDatos()
  return resultado
}

// --- Alumno

// Resultado publicado de una entrega propia (403 si todavía no se publicó).
export function getResultado(entregaId) {
  return request('GET', `/api/entregas/${entregaId}/resultado`)
}

// Nota única (0 a 10) y devolución del profesor, para entregas sin corrección por pregunta (anteriores a la
// corrección automática). Se puede volver a guardar para cambiarla.
export async function gradeSubmission(id, { nota, comentario }) {
  const { entrega } = await request('PUT', `/api/entregas/${id}/correccion`, { nota, comentario })
  await recargarDatos()
  return entrega
}
