import { BLOCK_TYPES } from '../documentBlocks.js'
import PromptField from './PromptField.jsx'
import CodeBlock from './CodeBlock.jsx'
import MultipleChoiceBlock from './MultipleChoiceBlock.jsx'
import TextBlock from './TextBlock.jsx'
import GeoGebraApplet from './GeoGebraApplet.jsx'

// Un apartado en modo edición: tipo y controles arriba, consigna, y la configuración propia del tipo.
export default function DocumentBlock({ block, index, total, onChange, onMove, onRemove, onGeoGebraReady }) {
  const label = BLOCK_TYPES[block.tipo]

  return (
    <section className="card block" aria-label={`${label} (apartado ${index + 1})`}>
      <div className="block-header">
        <span className="block-type">{index + 1}. {label}</span>
        <div className="block-controls">
          <button type="button" className="icon-button" onClick={() => onMove(-1)} disabled={index === 0}
            aria-label="Subir" title="Subir">↑</button>
          <button type="button" className="icon-button" onClick={() => onMove(1)} disabled={index === total - 1}
            aria-label="Bajar" title="Bajar">↓</button>
          <button type="button" className="icon-button danger" onClick={onRemove}>Eliminar</button>
        </div>
      </div>

      <PromptField
        value={block.consigna}
        onChange={(consigna) => onChange({ consigna })}
      />

      {block.tipo === 'texto' && <TextBlock block={block} onChange={onChange} />}
      {block.tipo === 'codigo' && <CodeBlock block={block} onChange={onChange} />}
      {block.tipo === 'opcion-multiple' && <MultipleChoiceBlock block={block} onChange={onChange} />}
      {block.tipo === 'geogebra' && (
        <GeoGebraApplet initialBase64={block.ggbBase64} onReady={onGeoGebraReady} />
      )}
    </section>
  )
}
