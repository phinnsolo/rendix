import { HERRAMIENTAS } from '../config.js'
import { formatDuracion } from '../examSettings.js'

// HH:MM:SS
export function formatRemaining(seconds) {
  const p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(seconds / 3600))}:${p(Math.floor((seconds % 3600) / 60))}:${p(seconds % 60)}`
}

// Últimos 10 minutos: resaltador; último minuto: rojo.
function claseTiempo(seconds) {
  if (seconds <= 60) return 'exam-time urgent'
  if (seconds <= 10 * 60) return 'exam-time warning'
  return 'exam-time'
}

const GUARDADO = {
  guardando: 'Guardando…',
  guardado: 'Guardado',
  'sin-conexion': 'Sin conexión (guardado en caché local)',
}

// Barra superior del examen: tema, duración y herramientas habilitadas.
// El tiempo restante solo aparece cuando llega `segundosRestantes` (el alumno está resolviendo), y el estado del
// autoguardado cuando llega `estadoGuardado` ('guardando' | 'guardado' | 'sin-conexion').
export default function ExamHeader({ tema, herramientas, duracion = null, segundosRestantes = null, estadoGuardado = null, sticky = false }) {
  const habilitadas = Object.entries(HERRAMIENTAS).filter(([key]) => herramientas[key])
  const resolviendo = segundosRestantes !== null

  return (
    <div className={sticky ? 'card exam-header sticky' : 'card exam-header'}>
      <div className="exam-header-main">
        <span className="exam-topic">{tema || 'Sin tema'}</span>
        {resolviendo && (
          <span className={claseTiempo(segundosRestantes)} role="timer" aria-label={`Tiempo restante ${formatRemaining(segundosRestantes)}`}>
            Tiempo restante: <strong>{formatRemaining(segundosRestantes)}</strong>
          </span>
        )}
        {estadoGuardado && (
          <span className={`save-status ${estadoGuardado}`} role="status">{GUARDADO[estadoGuardado]}</span>
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
