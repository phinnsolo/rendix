import { useState } from 'react'
import { emptyAnswer } from '../documentBlocks.js'
import ExamBlocks from './ExamBlocks.jsx'

// Vista previa del examen para el profesor. Las respuestas viven solo en memoria.
export default function DocumentBlocksView({ blocks }) {
  const [respuestas, setRespuestas] = useState(() =>
    Object.fromEntries(blocks.map((block) => [block.id, emptyAnswer(block)]))
  )

  return (
    <div className="blocks">
      {blocks.length > 0 && (
        <p className="muted small">Vista previa del examen: las respuestas que escribas acá no se guardan.</p>
      )}
      <ExamBlocks
        blocks={blocks}
        respuestas={respuestas}
        onChange={(id, value) => setRespuestas((current) => ({ ...current, [id]: value }))}
        showCorrect
      />
    </div>
  )
}
