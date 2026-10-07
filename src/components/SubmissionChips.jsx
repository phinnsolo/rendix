import { isGraded } from '../submissionsStore.js'

// Estado de una entrega para el profesor: corregida (con nota) o sin corregir, y si se envió por tiempo.
export default function SubmissionChips({ entrega }) {
  return (
    <>
      {isGraded(entrega)
        ? <span className="chip published">Nota: {entrega.correccion.nota}</span>
        : <span className="chip pending">Sin corregir</span>}
      {entrega.enviadoPorTiempo && <span className="chip">Enviado por tiempo</span>}
    </>
  )
}
