// Único módulo que accede al almacenamiento de turnos asignados a parciales.
// Para migrar a una base de datos, reemplazar estas funciones.
// Cada profesor tiene su propia clave: rendix_turnos_<username>.
// Cada registro es un parcial programado en uno de los turnos fijos de config.js (TURNOS), con fecha,
// hora de inicio y hora de fin (inicio + duración del parcial), y los alumnos que lo rinden.
// También guarda cuándo abrió cada alumno el parcial (aperturas), para el seguimiento del profesor.

import { getSession } from './auth.js'
import { PROFESORES, TURNOS } from './config.js'
import { isValidDuracion } from './examSettings.js'

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

// --- Horas ('HH:MM')

function aMinutos(hora) {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

function aHora(minutos) {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
}

export function sumarMinutos(hora, minutos) {
  return aHora(aMinutos(hora) + minutos)
}

// Hora de inicio más temprana y más tardía para que un parcial de `duracion` minutos entre en el turno,
// o null si no entra.
export function rangoInicio(turno, duracion) {
  const franja = TURNOS[turno]
  if (!franja || !isValidDuracion(duracion)) return null
  const hasta = aMinutos(franja.fin) - duracion
  if (hasta < aMinutos(franja.inicio)) return null
  return { desde: franja.inicio, hasta: aHora(hasta) }
}

// Los turnos creados antes de los turnos fijos tenían un nombre propio.
export function nombreTurno(turno) {
  return TURNOS[turno.turno]?.nombre ?? turno.nombre
}

// --- Estado (la fecha y las horas se interpretan en la hora local del navegador)

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
  return `${nombreTurno(turno)} · ${fecha} · ${turno.horaInicio} a ${turno.horaFin}`
}

export function alumnosLabel(n) {
  return n === 1 ? '1 alumno' : `${n} alumnos`
}

export function turnosLabel(n) {
  return n === 1 ? '1 turno' : `${n} turnos`
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
  return readAll().filter((t) => t.parcialId === parcialId).sort(byInicio)
}

// El próximo turno de un parcial que todavía no empezó, o null.
export function proximoTurno(parcialId) {
  return getTurnosFor(parcialId).find((t) => !hasStarted(t)) ?? null
}

// Devuelve { campo: mensaje } con los errores de un turno asignado; vacío si se puede guardar.
export function validateHorario({ turno, fecha, horaInicio }, duracion) {
  const errores = {}
  if (!TURNOS[turno]) errores.turno = 'Elegí un turno.'
  if (!fecha) errores.fecha = 'La fecha es obligatoria.'
  if (!isValidDuracion(duracion)) {
    errores.horaInicio = 'Primero indicá la duración del parcial.'
    return errores
  }
  if (errores.turno) return errores
  const rango = rangoInicio(turno, duracion)
  const franja = TURNOS[turno]
  if (!rango) {
    errores.horaInicio = `Un parcial de ${duracion} min no entra en el ${franja.nombre.toLowerCase()} (${franja.inicio} a ${franja.fin}).`
  } else if (!horaInicio) {
    errores.horaInicio = 'La hora de inicio es obligatoria.'
  } else if (horaInicio < rango.desde || horaInicio > rango.hasta) {
    errores.horaInicio =
      `Con ${duracion} min, en el ${franja.nombre.toLowerCase()} (${franja.inicio} a ${franja.fin}) ` +
      `tiene que empezar entre las ${rango.desde} y las ${rango.hasta}.`
  } else if (fecha && new Date(`${fecha}T${horaInicio}`).getTime() <= Date.now()) {
    errores.horaInicio = 'El horario ya pasó: elegí una fecha y hora a futuro.'
  }
  return errores
}

// Guarda los turnos de un parcial tal como quedaron en el formulario. `horarios` son
// { id?, turno, fecha, horaInicio }: los que tienen id actualizan uno existente y los demás se crean.
// Los que ya empezaron no se modifican ni se borran.
// Los `alumnosClase` que no estén en ningún turno del parcial se agregan al primero que no empezó.
export function syncHorarios(parcialId, horarios, duracion, alumnosClase = []) {
  const profesor = getSession().username
  const todos = readAll()
  const porId = new Map(horarios.filter((h) => h.id).map((h) => [h.id, h]))
  const resultado = []
  for (const t of todos) {
    if (t.parcialId !== parcialId || hasStarted(t)) {
      resultado.push(t)
      continue
    }
    const h = porId.get(t.id)
    if (h) resultado.push({ ...t, turno: h.turno, fecha: h.fecha, horaInicio: h.horaInicio, horaFin: sumarMinutos(h.horaInicio, duracion) })
  }
  for (const h of horarios.filter((h) => !h.id)) {
    resultado.push({
      id: crypto.randomUUID(),
      profesor,
      parcialId,
      turno: h.turno,
      fecha: h.fecha,
      horaInicio: h.horaInicio,
      horaFin: sumarMinutos(h.horaInicio, duracion),
      alumnos: [],
      aperturas: {},
      fechaCreacion: new Date().toISOString(),
    })
  }
  const delParcial = resultado.filter((t) => t.parcialId === parcialId).sort(byInicio)
  const destino = delParcial.find((t) => !hasStarted(t))
  if (destino) {
    const faltan = alumnosClase.filter((a) => !delParcial.some((t) => t.alumnos.includes(a)))
    destino.alumnos = [...destino.alumnos, ...faltan]
  }
  writeAll(profesor, resultado)
}

// Turno que empieza en este momento y dura `duracion` minutos (sin pasar de la medianoche). Puede quedar
// fuera de las franjas fijas: si la hora cae en una, usa esa; si no, se llama "Fuera de turno".
export function crearTurnoAhora(parcialId, duracion) {
  const profesor = getSession().username
  const ahora = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const horaInicio = `${p(ahora.getHours())}:${p(ahora.getMinutes())}`
  const franja = Object.entries(TURNOS).find(([, t]) => horaInicio >= t.inicio && horaInicio < t.fin)?.[0] ?? null
  const turno = {
    id: crypto.randomUUID(),
    profesor,
    parcialId,
    turno: franja,
    ...(franja ? {} : { nombre: 'Fuera de turno' }),
    fecha: `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}`,
    horaInicio,
    horaFin: aMinutos(horaInicio) + duracion >= 24 * 60 ? '23:59' : sumarMinutos(horaInicio, duracion),
    alumnos: [],
    aperturas: {},
    fechaCreacion: ahora.toISOString(),
  }
  writeAll(profesor, [...readAll(), turno])
  return turno
}

// Borra los turnos de un parcial que todavía no empezaron y quedaron sin alumnos.
export function borrarTurnosVacios(parcialId) {
  const profesor = getSession().username
  writeAll(profesor, readAll().filter((t) => t.parcialId !== parcialId || hasStarted(t) || t.alumnos.length > 0))
}

// Cuando cambian los alumnos de una clase: los agregados entran al primer turno del parcial que no empezó
// y los quitados salen de los turnos que no empezaron. Los turnos en curso o terminados no se tocan.
export function actualizarAlumnosDeParcial(profesor, parcialId, agregados, quitados) {
  const turnos = readAll(profesor).map((t) => {
    if (t.parcialId !== parcialId || hasStarted(t)) return t
    return { ...t, alumnos: t.alumnos.filter((a) => !quitados.includes(a)) }
  })
  const delParcial = turnos.filter((t) => t.parcialId === parcialId).sort(byInicio)
  const destino = delParcial.find((t) => !hasStarted(t))
  if (destino) {
    const faltan = agregados.filter((a) => !delParcial.some((t) => t.alumnos.includes(a)))
    destino.alumnos = [...destino.alumnos, ...faltan]
  }
  writeAll(profesor, turnos)
}

export function deleteTurnosFor(parcialId) {
  writeAll(getSession().username, readAll().filter((t) => t.parcialId !== parcialId))
}

// Otro turno del mismo parcial donde ya está el alumno (cada alumno rinde un parcial en un solo turno).
function turnoConAlumno(turnos, parcialId, alumno, exceptoId) {
  return turnos.find((t) => t.id !== exceptoId && t.parcialId === parcialId && t.alumnos.includes(alumno)) || null
}

// Agrega alumnos sin repetir. Si un alumno está en otro turno del mismo parcial que todavía no empezó,
// se lo mueve a este. Devuelve los que no se pudieron asignar porque ya rinden ese examen en otro turno
// que empezó.
export function asignarAlumnos(id, usernames) {
  let turnos = readAll()
  const turno = turnos.find((t) => t.id === id)
  if (!turno) throw new Error('El turno no existe.')
  if (estadoTurno(turno) === 'finalizado') throw new Error('El turno ya terminó.')
  const rechazados = []
  const alumnos = [...turno.alumnos]
  for (const username of usernames) {
    if (alumnos.includes(username)) continue
    const otro = turnoConAlumno(turnos, turno.parcialId, username, id)
    if (otro && hasStarted(otro)) {
      rechazados.push(username)
      continue
    }
    if (otro) {
      turnos = turnos.map((t) => (t.id === otro.id ? { ...t, alumnos: t.alumnos.filter((a) => a !== username) } : t))
    }
    alumnos.push(username)
  }
  writeAll(turno.profesor, turnos.map((t) => (t.id === id ? { ...t, alumnos } : t)))
  return rechazados
}

export function quitarAlumno(id, username) {
  const turno = getTurno(id)
  if (!turno) throw new Error('El turno no existe.')
  if (hasStarted(turno)) throw new Error('El turno ya comenzó: no se puede modificar.')
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
