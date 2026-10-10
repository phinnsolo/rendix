import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { formatDate } from '../formatDate.js'
import { getSubmission } from '../submissionsStore.js'
import ExamBlocks from '../components/ExamBlocks.jsx'
import ExamHeader from '../components/ExamHeader.jsx'
import GradingForm from '../components/GradingForm.jsx'
import NotFound from '../components/NotFound.jsx'
import SubmissionChips from '../components/SubmissionChips.jsx'

// Si el envío automático ocurrió tarde (el alumno volvió con el tiempo vencido), el tiempo usado es la duración.
function tiempoUsado({ fechaInicio, fechaEntrega, duracion }) {
  const transcurridos = Math.max(0, Math.round((Date.parse(fechaEntrega) - Date.parse(fechaInicio)) / 60_000))
  const minutos = duracion == null ? transcurridos : Math.min(transcurridos, duracion)
  return minutos < 1 ? 'menos de 1 min' : `${minutos} min`
}

// Entrega de un alumno, tal como la envió (usa la copia del parcial guardada en la entrega), con su corrección.
export default function SubmissionDetailPage() {
  const { id, entregaId } = useParams()
  const [searchParams] = useSearchParams()
  const [entrega, setEntrega] = useState(() => getSubmission(entregaId))
  const back = searchParams.get('from') === 'entregas'
    ? { to: '/entregas', label: 'Volver a entregas' }
    : { to: `/documentos/${id}`, label: 'Volver al parcial' }

  if (!entrega || entrega.parcialId !== id) {
    return <NotFound title="Entrega no encontrada" backTo={back.to} backLabel={back.label} />
  }

  return (
    <>
      <p><Link to={back.to}>← {back.label}</Link></p>
      <h1>{entrega.titulo} — {entrega.alumnoNombre}</h1>
      <p className="muted small chips-line">
        <SubmissionChips entrega={entrega} />
        {entrega.fechaInicio && `Comenzó: ${formatDate(entrega.fechaInicio)} · `}
        Entregó: {formatDate(entrega.fechaEntrega)}
        {entrega.fechaInicio && ` · Tiempo usado: ${tiempoUsado(entrega)}`}
      </p>
      <ExamHeader tema={entrega.tema} herramientas={entrega.herramientas} duracion={entrega.duracion ?? null} />
      <div className="blocks">
        <ExamBlocks blocks={entrega.bloques} respuestas={entrega.respuestas} readOnly showCorrect />
      </div>
      <GradingForm entrega={entrega} onGraded={setEntrega} />
    </>
  )
}
