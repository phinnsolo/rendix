import { entregasLabel, getSubmissionsFor } from './submissionsStore.js'
import { getTurnosFor, turnosLabel } from './turnosStore.js'

// Aviso para confirmar el borrado de un parcial: también se borran sus turnos asignados y entregas.
export function avisoBorrado(parcialId) {
  const turnos = getTurnosFor(parcialId).length
  const entregas = getSubmissionsFor(parcialId).length
  const partes = []
  if (turnos > 0) partes.push(turnosLabel(turnos))
  if (entregas > 0) partes.push(entregasLabel(entregas))
  return partes.length > 0 ? ` También se borran sus ${partes.join(' y ')}.` : ''
}
