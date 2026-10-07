import { Link, useParams } from 'react-router-dom'
import { formatDate } from '../formatDate.js'
import { getSubmission } from '../submissionsStore.js'
import ExamBlocks from '../components/ExamBlocks.jsx'
import ExamHeader from '../components/ExamHeader.jsx'
import NotFound from '../components/NotFound.jsx'

// Entrega de un alumno, tal como la envió (usa la copia del parcial guardada en la entrega).
export default function SubmissionDetailPage() {
  const { id, entregaId } = useParams()
  const entrega = getSubmission(entregaId)

  if (!entrega || entrega.parcialId !== id) {
    return <NotFound title="Entrega no encontrada" backTo={`/documentos/${id}`} backLabel="Volver al parcial" />
  }

  return (
    <>
      <p><Link to={`/documentos/${id}`}>← Volver al parcial</Link></p>
      <h1>{entrega.titulo} — {entrega.alumnoNombre}</h1>
      <p className="muted small">
        <span className="chip published">Entregado</span> {formatDate(entrega.fechaEntrega)}
      </p>
      <ExamHeader tema={entrega.tema} herramientas={entrega.herramientas} />
      <div className="blocks">
        <ExamBlocks blocks={entrega.bloques} respuestas={entrega.respuestas} readOnly showCorrect />
      </div>
    </>
  )
}
