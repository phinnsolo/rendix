// Estado en vivo de cada alumno de un turno, a partir de su sesión y su entrega (ver GET /api/turnos/:id/seguimiento).
// Lo usan el detalle del turno y la sección Monitoreo.

export const ESTADO_ALUMNO = {
  'no-abrio': { label: 'No abrió', className: 'chip' },
  'en-linea': { label: 'En línea', className: 'chip pending' },
  desconectado: { label: 'Desconectado', className: 'chip incorrect' },
  entregado: { label: 'Entregado', className: 'chip published' },
  'entregado-sistema': { label: 'Entregado por sistema', className: 'chip published' },
  'no-completo': { label: 'No completó', className: 'chip incorrect' },
}

export const SEGUIMIENTO_MS = 2000
// Sin latido en este tiempo (el alumno late cada 5 s), se lo considera desconectado.
const DESCONECTADO_MS = 12_000

export function estadoAlumno({ sesion, entrega }, estadoDelTurno, ahora) {
  if (entrega) return entrega.enviadoPorSistema ? 'entregado-sistema' : 'entregado'
  if (!sesion) return estadoDelTurno === 'finalizado' ? 'no-completo' : 'no-abrio'
  if (sesion.estado !== 'en-curso') return 'entregado-sistema'
  return ahora - Date.parse(sesion.ultimoLatido) > DESCONECTADO_MS ? 'desconectado' : 'en-linea'
}

export function haceCuanto(iso, ahora) {
  const s = Math.max(0, Math.round((ahora - Date.parse(iso)) / 1000))
  if (s < 60) return `hace ${s} s`
  return `hace ${Math.floor(s / 60)} min`
}

// Segundos que le quedan al alumno, o null si no está resolviendo.
export function restanteAlumno({ sesion, entrega }, ahora) {
  if (entrega || sesion?.estado !== 'en-curso') return null
  return Math.max(0, Math.ceil((Date.parse(sesion.deadline) - ahora) / 1000))
}

// Parte del tiempo del alumno que ya usó, de 0 a 1. Entregado: 1; sin abrir: 0.
export function progreso({ sesion, entrega }, ahora) {
  if (entrega || (sesion && sesion.estado !== 'en-curso')) return 1
  if (!sesion) return 0
  const inicio = Date.parse(sesion.apertura)
  const total = Date.parse(sesion.deadline) - inicio
  return total > 0 ? Math.min(1, Math.max(0, (ahora - inicio) / total)) : 1
}

// Último dato que llegó del alumno (latido, guardado o entrega), en ISO, o null.
export function ultimaActualizacion({ sesion, entrega }) {
  const fechas = [sesion?.ultimoLatido, sesion?.ultimoGuardado, entrega?.fechaEntrega].filter(Boolean)
  return fechas.length > 0 ? fechas.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b)) : null
}
