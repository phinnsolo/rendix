// Reglas de los turnos asignados a parciales, sin acceso a datos: las usan el frontend (turnosStore.js)
// y la API (server/), así el formulario y el servidor validan lo mismo.
// Un turno es un parcial programado en uno de los turnos fijos de config.js (TURNOS), con fecha, hora de
// inicio y hora de fin (inicio + duración del parcial), y los alumnos que lo rinden.
// Las funciones `aplicar*` reciben los turnos de un profesor y devuelven la lista nueva, sin modificarla.

import { TURNOS, ZONA_HORARIA, ZONA_HORARIA_IANA } from './config.js'
import { isValidDuracion } from './examSettings.js'
import { now } from './clock.js'

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

// --- Estado (la fecha y las horas se interpretan en la zona horaria de la app; la hora es la del servidor)

export function instante(fecha, hora) {
  return new Date(`${fecha}T${hora}:00${ZONA_HORARIA}`)
}

export function turnoInicio(turno) {
  return instante(turno.fecha, turno.horaInicio)
}

export function turnoFin(turno) {
  return instante(turno.fecha, turno.horaFin)
}

export function estadoTurno(turno, ahora = now()) {
  if (ahora < turnoInicio(turno).getTime()) return 'proximo'
  if (ahora < turnoFin(turno).getTime()) return 'en-curso'
  return 'finalizado'
}

export function hasStarted(turno, ahora = now()) {
  return estadoTurno(turno, ahora) !== 'proximo'
}

// Fecha ('YYYY-MM-DD') y hora ('HH:MM') de un instante en la zona horaria de la app.
export function fechaHoraLocal(ms) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA_HORARIA_IANA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(ms)
      .map((p) => [p.type, p.value])
  )
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` }
}

export function formatHorario(turno) {
  const fecha = turnoInicio(turno).toLocaleDateString('es-AR', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA_HORARIA_IANA,
  })
  return `${nombreTurno(turno)} · ${fecha} · ${turno.horaInicio} a ${turno.horaFin}`
}

export function alumnosLabel(n) {
  return n === 1 ? '1 alumno' : `${n} alumnos`
}

export function turnosLabel(n) {
  return n === 1 ? '1 turno' : `${n} turnos`
}

export function byInicio(a, b) {
  return turnoInicio(a) - turnoInicio(b)
}

// Devuelve { campo: mensaje } con los errores de un turno asignado; vacío si se puede guardar.
export function validateHorario({ turno, fecha, horaInicio }, duracion, ahora = now()) {
  const errores = {}
  if (!TURNOS[turno]) errores.turno = 'Elegí un turno.'
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) errores.fecha = 'La fecha es obligatoria.'
  if (!isValidDuracion(duracion)) {
    errores.horaInicio = 'Primero indicá la duración del parcial.'
    return errores
  }
  if (errores.turno) return errores
  const rango = rangoInicio(turno, duracion)
  const franja = TURNOS[turno]
  if (!rango) {
    errores.horaInicio = `Un parcial de ${duracion} min no entra en el ${franja.nombre.toLowerCase()} (${franja.inicio} a ${franja.fin}).`
  } else if (!horaInicio || !/^\d{2}:\d{2}$/.test(horaInicio)) {
    errores.horaInicio = 'La hora de inicio es obligatoria.'
  } else if (horaInicio < rango.desde || horaInicio > rango.hasta) {
    errores.horaInicio =
      `Con ${duracion} min, en el ${franja.nombre.toLowerCase()} (${franja.inicio} a ${franja.fin}) ` +
      `tiene que empezar entre las ${rango.desde} y las ${rango.hasta}.`
  } else if (!errores.fecha && instante(fecha, horaInicio).getTime() <= ahora) {
    errores.horaInicio = 'El horario ya pasó: elegí una fecha y hora a futuro.'
  }
  return errores
}

// --- Cambios (devuelven la lista nueva de turnos del profesor)

// Los turnos de un parcial tal como quedaron en el formulario. `horarios` son { id?, turno, fecha, horaInicio }:
// los que tienen id actualizan uno existente y los demás se crean. Los que ya empezaron no se modifican ni se
// borran. Los `alumnosClase` que no estén en ningún turno del parcial se agregan al primero que no empezó.
export function aplicarHorarios(todos, { profesor, parcialId, horarios, duracion, alumnosClase = [] }, ahora = now()) {
  const porId = new Map(horarios.filter((h) => h.id).map((h) => [h.id, h]))
  const resultado = []
  for (const t of todos) {
    if (t.parcialId !== parcialId || hasStarted(t, ahora)) {
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
      nombre: null,
      fecha: h.fecha,
      horaInicio: h.horaInicio,
      horaFin: sumarMinutos(h.horaInicio, duracion),
      alumnos: [],
    })
  }
  return conAlumnosFaltantes(resultado, parcialId, alumnosClase, ahora)
}

// Los `agregados` entran al primer turno del parcial que no empezó, si no están ya en otro.
function conAlumnosFaltantes(turnos, parcialId, agregados, ahora) {
  const delParcial = turnos.filter((t) => t.parcialId === parcialId).sort(byInicio)
  const destino = delParcial.find((t) => !hasStarted(t, ahora))
  if (!destino) return turnos
  const faltan = agregados.filter((a) => !delParcial.some((t) => t.alumnos.includes(a)))
  if (faltan.length === 0) return turnos
  return turnos.map((t) => (t.id === destino.id ? { ...t, alumnos: [...t.alumnos, ...faltan] } : t))
}

// Turno que empieza en este momento y dura `duracion` minutos (sin pasar de la medianoche). Puede quedar
// fuera de las franjas fijas: si la hora cae en una, usa esa; si no, se llama "Fuera de turno".
export function nuevoTurnoAhora({ profesor, parcialId, duracion }, ahora = now()) {
  const { fecha, hora: horaInicio } = fechaHoraLocal(ahora)
  const franja = Object.entries(TURNOS).find(([, t]) => horaInicio >= t.inicio && horaInicio < t.fin)?.[0] ?? null
  return {
    id: crypto.randomUUID(),
    profesor,
    parcialId,
    turno: franja,
    nombre: franja ? null : 'Fuera de turno',
    fecha,
    horaInicio,
    horaFin: aMinutos(horaInicio) + duracion >= 24 * 60 ? '23:59' : sumarMinutos(horaInicio, duracion),
    alumnos: [],
  }
}

// Saca los turnos de un parcial que todavía no empezaron y quedaron sin alumnos.
export function aplicarBorrarVacios(turnos, parcialId, ahora = now()) {
  return turnos.filter((t) => t.parcialId !== parcialId || hasStarted(t, ahora) || t.alumnos.length > 0)
}

// Cuando cambian los alumnos de una clase: los agregados entran al primer turno del parcial que no empezó
// y los quitados salen de los turnos que no empezaron. Los turnos en curso o terminados no se tocan.
export function aplicarCambioAlumnos(turnos, parcialId, agregados, quitados, ahora = now()) {
  const sinQuitados = turnos.map((t) => {
    if (t.parcialId !== parcialId || hasStarted(t, ahora)) return t
    return { ...t, alumnos: t.alumnos.filter((a) => !quitados.includes(a)) }
  })
  return conAlumnosFaltantes(sinQuitados, parcialId, agregados, ahora)
}

// Agrega alumnos sin repetir. Si un alumno está en otro turno del mismo parcial que todavía no empezó,
// se lo mueve a este. Devuelve también los que no se pudieron asignar porque ya rinden ese examen en otro
// turno que empezó.
export function aplicarAsignacion(turnos, id, usernames, ahora = now()) {
  const turno = turnos.find((t) => t.id === id)
  if (!turno) throw new Error('El turno no existe.')
  if (estadoTurno(turno, ahora) === 'finalizado') throw new Error('El turno ya terminó.')
  const rechazados = []
  const alumnos = [...turno.alumnos]
  let resultado = turnos
  for (const username of usernames) {
    if (alumnos.includes(username)) continue
    const otro = resultado.find((t) => t.id !== id && t.parcialId === turno.parcialId && t.alumnos.includes(username))
    if (otro && hasStarted(otro, ahora)) {
      rechazados.push(username)
      continue
    }
    if (otro) {
      resultado = resultado.map((t) => (t.id === otro.id ? { ...t, alumnos: t.alumnos.filter((a) => a !== username) } : t))
    }
    alumnos.push(username)
  }
  return { turnos: resultado.map((t) => (t.id === id ? { ...t, alumnos } : t)), rechazados }
}

export function aplicarQuitarAlumno(turnos, id, username, ahora = now()) {
  const turno = turnos.find((t) => t.id === id)
  if (!turno) throw new Error('El turno no existe.')
  if (hasStarted(turno, ahora)) throw new Error('El turno ya comenzó: no se puede modificar.')
  return turnos.map((t) => (t.id === id ? { ...t, alumnos: t.alumnos.filter((a) => a !== username) } : t))
}
