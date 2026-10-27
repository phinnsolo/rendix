import { isGraded } from '../submissionsStore.js'

// Estado de una entrega para el profesor: corregida (con nota) o sin corregir, y si se envió sola.
export default function SubmissionChips({ entrega }) {
  return (
    <>
      {isGraded(entrega)
        ? <span className="chip published">Nota: {entrega.correccion.nota}</span>
        : <span className="chip pending">Sin corregir</span>}
      {entrega.enviadoPorTiempo && <span className="chip">Entregado por tiempo</span>}
      {entrega.enviadoPorSistema && <span className="chip">Entregado por sistema</span>}
    </>
  )
}
