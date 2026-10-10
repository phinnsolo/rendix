import { getClase } from './clasesStore.js'
import { isPublished, publishDocument } from './documentsStore.js'
import { getDuracion, isValidDuracion } from './examSettings.js'
import { asignarAlumnos, borrarTurnosVacios, crearTurnoAhora, estadoTurno, getTurnosFor } from './turnosStore.js'

// "Tomar ahora": abre un turno que empieza en este momento con todos los alumnos de la clase y publica el
// parcial, para tomarlo sin programarlo antes.

// Hace falta que el parcial tenga clase y duración, y que no se esté tomando ya en otro turno.
export function puedeTomarAhora(doc) {
  return (
    Boolean(getClase(doc.claseId)) &&
    isValidDuracion(getDuracion(doc)) &&
    !getTurnosFor(doc.id).some((t) => estadoTurno(t) === 'en-curso')
  )
}

// Los alumnos que estaban en un turno que todavía no empezó se pasan a este; los que ya lo rindieron
// (o lo están rindiendo) quedan donde estaban. Los turnos programados que quedan vacíos se borran.
export function tomarAhora(doc) {
  const turno = crearTurnoAhora(doc.id, getDuracion(doc))
  asignarAlumnos(turno.id, getClase(doc.claseId).alumnos)
  borrarTurnosVacios(doc.id)
  if (!isPublished(doc)) publishDocument(doc.id)
  return turno
}

export function confirmarTomarAhora(doc) {
  return window.confirm(
    `¿Tomar "${doc.titulo}" ahora? Se publica y los alumnos de la clase lo pueden abrir ya, durante ${getDuracion(doc)} min.`
  )
}
