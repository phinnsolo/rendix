import { useState } from 'react'
import { BLOCK_TYPES, CODE_LANGUAGES, emptyAnswer } from '../documentBlocks.js'
import BlockAnswer from './BlockAnswer.jsx'

// Vista previa del examen: cada apartado muestra su consigna y, separada, el área de respuesta.
// Las respuestas viven solo en memoria; se guardarán cuando exista el flujo de alumno.
export default function DocumentBlocksView({ blocks }) {
  const [respuestas, setRespuestas] = useState(() =>
    Object.fromEntries(blocks.map((block) => [block.id, emptyAnswer(block)]))
  )

  if (blocks.length === 0) {
    return <div className="card content"><span className="muted">(Sin consignas)</span></div>
  }

  return (
    <div className="blocks">
      <p className="muted small">Vista previa del examen: las respuestas que escribas acá no se guardan.</p>
      {blocks.map((block, index) => (
        <section key={block.id} className="card block" aria-label={`Apartado ${index + 1}`}>
          <div className="block-header">
            <span className="block-type">
              {index + 1}. {BLOCK_TYPES[block.tipo]}
              {block.tipo === 'codigo' && ` · ${CODE_LANGUAGES[block.lenguaje] ?? block.lenguaje}`}
            </span>
          </div>
          {block.consigna && <div className="content block-prompt">{block.consigna}</div>}
          {block.tipo === 'texto' && block.contenido && <div className="content block-text">{block.contenido}</div>}
          <div className="block-answer">
            <span className="block-answer-label">Respuesta</span>
            <BlockAnswer
              block={block}
              value={respuestas[block.id]}
              onChange={(value) => setRespuestas((current) => ({ ...current, [block.id]: value }))}
              showCorrect
            />
          </div>
        </section>
      ))}
    </div>
  )
}
