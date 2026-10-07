import { BLOCK_TYPES, CODE_LANGUAGES } from '../documentBlocks.js'
import BlockAnswer from './BlockAnswer.jsx'

// Apartados del examen: cada uno muestra su consigna y, separada, el área de respuesta.
// No guarda estado: las respuestas llegan en `respuestas` ({ [blockId]: valor }) y cambian con `onChange`.
export default function ExamBlocks({ blocks, respuestas, onChange, readOnly = false, showCorrect = false, onGeoGebraReady }) {
  if (blocks.length === 0) {
    return <div className="card content"><span className="muted">(Sin consignas)</span></div>
  }

  return blocks.map((block, index) => (
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
          onChange={(value) => onChange?.(block.id, value)}
          readOnly={readOnly}
          showCorrect={showCorrect}
          onGeoGebraReady={(api) => onGeoGebraReady?.(block.id, api)}
        />
      </div>
    </section>
  ))
}
