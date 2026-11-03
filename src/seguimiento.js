// Estado en vivo de cada alumno de un turno, a partir de su sesión y su entrega (ver GET /api/turnos/:id/seguimiento).
// Lo usan el detalle del turno y la sección Monitoreo. Los cuatro estados del modo restringido (En curso, Entregado,
// Salió y se entregó, Incidente) los decide el servidor; acá solo se traducen para mostrarlos.

import { ESTADO_PANEL, SENALES } from './estadoExamen.js'
import { turnoFin, turnoInicio } from './turnos.js'

export const ESTADO_ALUMNO = ESTADO_PANEL

export const SEGUIMIENTO_MS = 2000
// Sin latido en este tiempo (el alumno late cada 2 s) se avisa "sin señal"; a los 8 s el servidor lo marca Incidente.
const SIN_SENAL_MS = 4000

export function estadoAlumno({ sesion, entrega }, estadoDelTurno) {
  if (entrega) return entrega.salidaVoluntaria ? 'salio-entrego' : 'entregado'
  if (!sesion) return estadoDelTurno === 'finalizado' ? 'no-completo' : 'no-abrio'
  if (sesion.estado === 'incidente') return 'incidente'
  if (sesion.estado === 'salio-entrego') return 'salio-entrego'
  if (sesion.estado === 'en-curso') return 'en-curso'
  return 'entregado'
}

// Aclaración debajo del estado: por qué se entregó, la causa del incidente, si espera volver o si no llega señal.
export function detalleEstado({ sesion, entrega }, ahora) {
  if (entrega) {
    if (entrega.salidaVoluntaria) return 'Usó el botón SALIR'
    if (entrega.enviadoPorSistema) return 'Por sistema (venció el tiempo)'
    if (entrega.enviadoPorTiempo) return 'Por tiempo'
    return null
  }
  if (!sesion) return null
  if (sesion.estado === 'incidente') return SENALES[sesion.incidenteCausa] ?? 'Salida del modo restringido'
  if (sesion.estado !== 'en-curso') return null
  if (sesion.reingresoPendiente) return 'Reanudado: esperando que vuelva a pantalla completa'
  const sinSenal = ahora - Date.parse(sesion.ultimoLatido)
  if (sinSenal > SIN_SENAL_MS) return `Sin señal hace ${Math.round(sinSenal / 1000)} s`
  return sesion.reanudaciones > 0 ? `Reanudado ${sesion.reanudaciones === 1 ? '1 vez' : `${sesion.reanudaciones} veces`}` : null
}

export function haceCuanto(iso, ahora) {
  const s = Math.max(0, Math.round((ahora - Date.parse(iso)) / 1000))
  if (s < 60) return `hace ${s} s`
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  return `hace ${Math.floor(s / 3600)} h`
}

// Parte del tiempo del alumno que ya pasó, de 0 a 1. Entregado: 1; sin abrir: 0. En Incidente el tiempo está
// detenido; después de una reanudación se mide contra su propia hora límite.
export function progreso({ sesion, entrega }, turno, ahora) {
  if (entrega || (sesion && !['en-curso', 'incidente'].includes(sesion.estado))) return 1
  if (!sesion) return 0
  const inicio = turnoInicio(turno).getTime()
  const total = turnoFin(turno).getTime() - inicio
  if (total <= 0) return 1
  const restante = sesion.estado === 'incidente' || sesion.reingresoPendiente
    ? sesion.restanteMs ?? 0
    : Date.parse(sesion.deadline) - ahora
  return Math.min(1, Math.max(0, 1 - restante / total))
}

// Último dato que llegó del alumno (latido, guardado, incidente o entrega), en ISO, o null.
export function ultimaActualizacion({ sesion, entrega }) {
  const fechas = [sesion?.ultimoLatido, sesion?.ultimoGuardado, sesion?.incidenteFecha, sesion?.fechaFin, entrega?.fechaEntrega].filter(Boolean)
  return fechas.length > 0 ? fechas.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b)) : null
}
