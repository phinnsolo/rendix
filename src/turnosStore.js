// Turnos asignados a parciales que ve el usuario logueado (de getDatos()) y cambios a través de la API.
// Las reglas (horas, estado, validación) están en turnos.js, compartidas con el servidor.
// Cada turno trae `aperturas`: cuándo abrió el parcial cada alumno, para el seguimiento del profesor.

import { request } from './api.js'
import { getDatos, recargarDatos } from './datos.js'
import { byInicio, hasStarted } from './turnos.js'

export {
  alumnosLabel, estadoTurno, formatHorario, hasStarted, nombreTurno, rangoInicio, sumarMinutos, turnoFin, turnoInicio,
  turnosLabel, validateHorario,
} from './turnos.js'

// --- Profesor

export function getTurnos() {
  return [...getDatos().turnos].sort(byInicio)
}

export function getTurno(id) {
  return getDatos().turnos.find((t) => t.id === id) || null
}

export function getTurnosFor(parcialId) {
  return getTurnos().filter((t) => t.parcialId === parcialId)
}

// El próximo turno de un parcial que todavía no empezó, o null.
export function proximoTurno(parcialId) {
  return getTurnosFor(parcialId).find((t) => !hasStarted(t)) ?? null
}

// Agrega alumnos sin repetir. Si un alumno está en otro turno del mismo parcial que todavía no empezó,
// se lo mueve a este. Devuelve los que no se pudieron asignar porque ya rinden ese examen en otro turno
// que empezó.
export async function asignarAlumnos(id, usernames) {
  const { rechazados } = await request('POST', `/api/turnos/${id}/alumnos`, { usernames })
  await recargarDatos()
  return rechazados
}

export async function quitarAlumno(id, username) {
  await request('DELETE', `/api/turnos/${id}/alumnos/${encodeURIComponent(username)}`)
  await recargarDatos()
}

// Estado en vivo de cada alumno del turno (sesión y entrega). Se pide directo al servidor, sin pasar por getDatos().
export function getSeguimiento(id) {
  return request('GET', `/api/turnos/${id}/seguimiento`)
}

// --- Alumno (el servidor solo manda sus turnos de parciales publicados)

export function getTurnosDeAlumno(alumno) {
  return getTurnos().filter((t) => t.alumnos.includes(alumno))
}

export function getTurnoDeAlumno(alumno, parcialId) {
  return getTurnosDeAlumno(alumno).find((t) => t.parcialId === parcialId) || null
}

// Momento en que el alumno abrió el parcial (ISO), o null si todavía no lo abrió.
export function getApertura(turno, alumno) {
  return turno?.aperturas?.[alumno] ?? null
}
