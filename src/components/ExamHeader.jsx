import { HERRAMIENTAS } from '../config.js'

function formatRemaining(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`
}

// Barra superior del examen: tema, herramientas habilitadas y tiempo restante.
// Solo muestra datos: todavía no hay temporizador, así que sin `segundosRestantes` muestra "--:--".
export default function ExamHeader({ tema, herramientas, segundosRestantes = null }) {
  const habilitadas = Object.entries(HERRAMIENTAS).filter(([key]) => herramientas[key])

  return (
    <div className="card exam-header">
      <div className="exam-header-main">
        <span className="exam-topic">{tema || 'Sin tema'}</span>
        <span className="exam-time">
          Tiempo restante: <strong>{segundosRestantes === null ? '--:--' : formatRemaining(segundosRestantes)}</strong>
        </span>
      </div>
      <div className="exam-tools">
        <span className="muted">Herramientas:</span>
        {habilitadas.length === 0
          ? <span className="muted">ninguna</span>
          : habilitadas.map(([key, label]) => <span key={key} className="chip">{label}</span>)}
      </div>
    </div>
  )
}
