// Único módulo que accede al almacenamiento de turnos.
// Para migrar a una base de datos, reemplazar estas funciones.
// Cada profesor tiene su propia clave: rendix_turnos_<username>.
// Un turno es un parcial publicado con fecha, horario y los alumnos que lo rinden.
// También guarda cuándo abrió cada alumno el parcial (aperturas), para el seguimiento del profesor.

import { getSession } from './auth.js'
import { PROFESORES } from './config.js'
import { getDocument, isPublished } from './documentsStore.js'

function storageKey(profesor) {
  return `rendix_turnos_${profesor}`
}

function readAll(profesor = getSession().username) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(profesor))) || []
  } catch {
    return []
  }
}

function writeAll(profesor, turnos) {
  localStorage.setItem(storageKey(profesor), JSON.stringify(turnos))
}

// La fecha y las horas se interpretan en la hora local del navegador.
export function turnoInicio(turno) {
  return new Date(`${turno.fecha}T${turno.horaInicio}`)
}

export function turnoFin(turno) {
  return new Date(`${turno.fecha}T${turno.horaFin}`)
}

export function estadoTurno(turno, ahora = Date.now()) {
  if (ahora < turnoInicio(turno).getTime()) return 'proximo'
  if (ahora < turnoFin(turno).getTime()) return 'en-curso'
  return 'finalizado'
}

export function hasStarted(turno, ahora = Date.now()) {
  return estadoTurno(turno, ahora) !== 'proximo'
}

export function formatHorario(turno) {
  const fecha = turnoInicio(turno).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${fecha} · ${turno.horaInicio} a ${turno.horaFin}`
}

export function alumnosLabel(n) {
  return n === 1 ? '1 alumno' : `${n} alumnos`
}

function byInicio(a, b) {
  return turnoInicio(a) - turnoInicio(b)
}

// --- Profesor (usa la clave de su propia sesión)

export function getTurnos() {
  return readAll().sort(byInicio)
}

export function getTurno(id) {
  return readAll().find((t) => t.id === id) || null
}

export function getTurnosFor(parcialId) {
  return readAll().filter((t) => t.parcialId === parcialId)
}

// Otro turno del mismo parcial donde ya está el alumno (cada alumno rinde un parcial en un solo turno).
function turnoConAlumno(turnos, parcialId, alumno, exceptoId) {
  return turnos.find((t) => t.id !== exceptoId && t.parcialId === parcialId && t.alumnos.includes(alumno)) || null
}

// Devuelve { campo: mensaje } con los errores; vacío si el turno se puede guardar.
export function validateTurno({ nombre, parcialId, fecha, horaInicio, horaFin }, id = null) {
  const errores = {}
  if (!nombre.trim()) errores.nombre = 'El nombre es obligatorio.'
  if (!parcialId) errores.parcialId = 'Elegí un examen.'
  else if (!isPublished(getDocument(parcialId))) errores.parcialId = 'Solo se puede elegir un examen publicado.'
  if (!fecha) errores.fecha = 'La fecha es obligatoria.'
  if (!horaInicio) errores.horaInicio = 'La hora de inicio es obligatoria.'
  if (!horaFin) errores.horaFin = 'La hora de fin es obligatoria.'
  else if (horaInicio && horaFin <= horaInicio) errores.horaFin = 'La hora de fin tiene que ser posterior a la de inicio.'

  if (id && parcialId && !errores.parcialId) {
    const turnos = readAll()
    const actual = turnos.find((t) => t.id === id)
    const repetido = actual?.alumnos.find((alumno) => turnoConAlumno(turnos, parcialId, alumno, id))
    if (repetido) errores.parcialId = `${repetido} ya está asignado a otro turno de ese examen.`
  }
  return errores
}

export function createTurno({ nombre, parcialId, fecha, horaInicio, horaFin }) {
  const turno = {
    id: crypto.randomUUID(),
    profesor: getSession().username,
    nombre: nombre.trim(),
    parcialId,
    fecha,
    horaInicio,
    horaFin,
    alumnos: [],
    aperturas: {},
    fechaCreacion: new Date().toISOString(),
  }
  writeAll(turno.profesor, [...readAll(), turno])
  return turno
}

function assertNotStarted(turno) {
  if (!turno) throw new Error('El turno no existe.')
  if (hasStarted(turno)) throw new Error('El turno ya comenzó: no se puede modificar.')
}

export function updateTurno(id, { nombre, parcialId, fecha, horaInicio, horaFin }) {
  assertNotStarted(getTurno(id))
  let updated = null
  const turnos = readAll().map((t) => {
    if (t.id !== id) return t
    updated = { ...t, nombre: nombre.trim(), parcialId, fecha, horaInicio, horaFin }
    return updated
  })
  writeAll(getSession().username, turnos)
  return updated
}

export function deleteTurno(id) {
  assertNotStarted(getTurno(id))
  writeAll(getSession().username, readAll().filter((t) => t.id !== id))
}

export function deleteTurnosFor(parcialId) {
  writeAll(getSession().username, readAll().filter((t) => t.parcialId !== parcialId))
}

// Agrega alumnos sin repetir. Devuelve los que no se pudieron asignar porque ya rinden ese examen en otro turno.
export function asignarAlumnos(id, usernames) {
  const turnos = readAll()
  const turno = turnos.find((t) => t.id === id)
  if (!turno) throw new Error('El turno no existe.')
  if (estadoTurno(turno) === 'finalizado') throw new Error('El turno ya terminó.')
  const rechazados = []
  const alumnos = [...turno.alumnos]
  for (const username of usernames) {
    if (alumnos.includes(username)) continue
    if (turnoConAlumno(turnos, turno.parcialId, username, id)) rechazados.push(username)
    else alumnos.push(username)
  }
  writeAll(turno.profesor, turnos.map((t) => (t.id === id ? { ...t, alumnos } : t)))
  return rechazados
}

export function quitarAlumno(id, username) {
  assertNotStarted(getTurno(id))
  writeAll(
    getSession().username,
    readAll().map((t) => (t.id === id ? { ...t, alumnos: t.alumnos.filter((a) => a !== username) } : t))
  )
}

// --- Alumno (recorre los turnos de todos los profesores)

export function getTurnosDeAlumno(alumno) {
  return PROFESORES.flatMap((p) => readAll(p.username))
    .filter((t) => t.alumnos.includes(alumno))
    .sort(byInicio)
}

export function getTurnoDeAlumno(alumno, parcialId) {
  return getTurnosDeAlumno(alumno).find((t) => t.parcialId === parcialId) || null
}

// Momento en que el alumno abrió el parcial (ISO), o null si todavía no lo abrió.
export function getApertura(turno, alumno) {
  return turno?.aperturas?.[alumno] ?? null
}

// Se registra una sola vez: si el alumno ya lo había abierto, devuelve la fecha original.
export function registrarApertura(turno, alumno) {
  const turnos = readAll(turno.profesor)
  const actual = turnos.find((t) => t.id === turno.id)
  const previa = getApertura(actual, alumno)
  if (previa) return previa
  const ahora = new Date().toISOString()
  writeAll(
    turno.profesor,
    turnos.map((t) => (t.id === turno.id ? { ...t, aperturas: { ...t.aperturas, [alumno]: ahora } } : t))
  )
  return ahora
}
