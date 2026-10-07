import { HERRAMIENTAS } from '../config.js'
import { formatDuracion } from '../examSettings.js'

function formatRemaining(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`
}

// Barra superior del examen: tema, duración y herramientas habilitadas.
// El tiempo restante solo aparece cuando llega `segundosRestantes` (el alumno está resolviendo).
export default function ExamHeader({ tema, herramientas, duracion = null, segundosRestantes = null, sticky = false }) {
  const habilitadas = Object.entries(HERRAMIENTAS).filter(([key]) => herramientas[key])
  const resolviendo = segundosRestantes !== null

  return (
    <div className={sticky ? 'card exam-header sticky' : 'card exam-header'}>
      <div className="exam-header-main">
        <span className="exam-topic">{tema || 'Sin tema'}</span>
        {resolviendo && (
          <span className={segundosRestantes <= 5 * 60 ? 'exam-time low' : 'exam-time'} role="timer">
            Tiempo restante: <strong>{formatRemaining(segundosRestantes)}</strong>
          </span>
        )}
      </div>
      <div className="exam-tools">
        <span className="muted">Duración:</span>
        <span>{formatDuracion(duracion)}</span>
        <span className="muted exam-tools-sep">·</span>
        <span className="muted">Herramientas:</span>
        {habilitadas.length === 0
          ? <span className="muted">ninguna</span>
          : habilitadas.map(([key, label]) => <span key={key} className="chip">{label}</span>)}
      </div>
    </div>
  )
}
