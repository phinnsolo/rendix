import { useState } from 'react'
import { HERRAMIENTAS } from '../config.js'
import Calculator from './Calculator.jsx'
import GeoGebraApplet from './GeoGebraApplet.jsx'

const ICONS = { calculadora: '🧮', geogebra: '📐' }

function ToolContent({ tool }) {
  if (tool === 'calculadora') return <Calculator />
  if (tool === 'geogebra') return <div className="tool-geogebra"><GeoGebraApplet /></div>
  return null
}

// Herramientas habilitadas por el profesor, accesibles mientras el alumno resuelve.
// Pestañas fijas a la izquierda; cada una abre una ventanita flotante. Una herramienta ya abierta
// queda montada (solo se oculta) para no perder lo que el alumno hizo en ella.
export default function ExamToolsPanel({ herramientas }) {
  const habilitadas = Object.keys(HERRAMIENTAS).filter((key) => herramientas[key])
  const [activa, setActiva] = useState(null)
  const [montadas, setMontadas] = useState(() => new Set())

  if (habilitadas.length === 0) return null

  function toggle(tool) {
    setActiva((current) => (current === tool ? null : tool))
    setMontadas((current) => (current.has(tool) ? current : new Set(current).add(tool)))
  }

  return (
    <aside className="tools-dock" aria-label="Herramientas">
      <div className="tools-tabs">
        {habilitadas.map((tool) => (
          <button
            key={tool}
            type="button"
            className={activa === tool ? 'tools-tab active' : 'tools-tab'}
            onClick={() => toggle(tool)}
            aria-expanded={activa === tool}
            title={HERRAMIENTAS[tool]}
          >
            <span aria-hidden="true">{ICONS[tool]}</span>
            <span className="tools-tab-label">{HERRAMIENTAS[tool]}</span>
          </button>
        ))}
      </div>
      {habilitadas.filter((tool) => montadas.has(tool)).map((tool) => (
        <section
          key={tool}
          className={`tools-window tools-window-${tool}`}
          hidden={activa !== tool}
          aria-label={HERRAMIENTAS[tool]}
        >
          <div className="tools-window-header">
            <strong>{HERRAMIENTAS[tool]}</strong>
            <button type="button" className="icon-button" onClick={() => setActiva(null)} aria-label="Cerrar herramienta">
              ✕
            </button>
          </div>
          <div className="tools-window-body">
            <ToolContent tool={tool} />
          </div>
        </section>
      ))}
    </aside>
  )
}
