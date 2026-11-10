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
  'sin-conexion': 'Sin conexión (guardado en este equipo)',
  'sin-copia': 'Sin conexión y sin espacio en este equipo: lo último que escribiste no está guardado. No cierres esta pestaña.',
}

// Barra superior del examen: tema, duración y herramientas habilitadas.
// El tiempo restante solo aparece cuando llega `segundosRestantes` (el alumno está resolviendo), y el estado del
// autoguardado cuando llega `estadoGuardado` ('guardando' | 'guardado' | 'sin-conexion' | 'sin-copia'). Con `onSalir` (modo
// restringido) muestra el botón rojo SALIR, siempre visible porque la barra es fija.
// `respondidas` ({ hechas, total }) muestra cuántas consignas respondió el alumno mientras resuelve.
export default function ExamHeader({ tema, herramientas, duracion = null, segundosRestantes = null, respondidas = null, estadoGuardado = null, sticky = false, onSalir = null, salirDeshabilitado = false }) {
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
        {respondidas && (
          <span className="exam-progress">
            Respondiste <strong>{respondidas.hechas}</strong> de {respondidas.total}
          </span>
        )}
        {estadoGuardado && (
          <span className={`save-status ${estadoGuardado}`} role="status">{GUARDADO[estadoGuardado]}</span>
        )}
        {onSalir && (
          <button type="button" className="exam-exit" onClick={onSalir} disabled={salirDeshabilitado}>
            Salir
          </button>
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
