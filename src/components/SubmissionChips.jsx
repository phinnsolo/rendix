import { ESTADO_CORRECCION } from '../correccion.js'
import { alertasDe, isGraded } from '../submissionsStore.js'

// Estado de una entrega para el profesor: estado de la corrección (Entregado, En evaluación, Evaluado, Publicado) con
// la nota, las alertas de los agentes jueces y si se envió sola.
export default function SubmissionChips({ entrega }) {
  const estado = ESTADO_CORRECCION[entrega.estadoCorreccion] ?? ESTADO_CORRECCION.entregado
  const alertas = alertasDe(entrega)
  const nota = isGraded(entrega) ? entrega.correccion?.nota ?? entrega.nota : entrega.nota
  return (
    <>
      <span className={estado.className}>{estado.label}{nota != null && ` · Nota: ${String(nota).replace('.', ',')}`}</span>
      {alertas.errores + alertas.manuales > 0 && !isGraded(entrega) && (
        <span className="chip incorrect">{alertas.errores + alertas.manuales} para corregir a mano</span>
      )}
      {alertas.bajaConfianza > 0 && !isGraded(entrega) && <span className="chip pending">Baja confianza</span>}
      {alertas.vacias > 0 && !isGraded(entrega) && <span className="chip">Respuestas vacías</span>}
      {entrega.enviadoPorTiempo && <span className="chip">Entregado por tiempo</span>}
      {entrega.enviadoPorSistema && <span className="chip">Entregado por sistema</span>}
    </>
  )
}
