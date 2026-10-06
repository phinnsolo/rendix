import { BLOCK_TYPES } from '../documentBlocks.js'
import TextBlock from './TextBlock.jsx'
import CodeBlock from './CodeBlock.jsx'
import GeoGebraApplet from './GeoGebraApplet.jsx'

// Un apartado en modo edición: tipo, contenido y controles para moverlo o eliminarlo.
export default function DocumentBlock({ block, index, total, onChange, onMove, onRemove, onGeoGebraReady }) {
  const label = BLOCK_TYPES[block.tipo]
  const position = `${label} (apartado ${index + 1})`

  return (
    <section className="card block" aria-label={position}>
      <span className="block-type">{label}</span>

      {block.tipo === 'texto' && <TextBlock block={block} onChange={onChange} label={position} />}
      {block.tipo === 'codigo' && <CodeBlock block={block} onChange={onChange} />}
      {block.tipo === 'geogebra' && (
        <GeoGebraApplet initialBase64={block.ggbBase64} onReady={onGeoGebraReady} />
      )}

      <div className="actions block-actions">
        <button type="button" className="secondary" onClick={() => onMove(-1)} disabled={index === 0}>
          ↑ Subir
        </button>
        <button type="button" className="secondary" onClick={() => onMove(1)} disabled={index === total - 1}>
          ↓ Bajar
        </button>
        <button type="button" className="danger" onClick={onRemove}>Eliminar</button>
      </div>
    </section>
  )
}
