import { BLOCK_TYPES, CODE_LANGUAGES } from '../documentBlocks.js'
import BlockAnswer from './BlockAnswer.jsx'
import GeoGebraApplet from './GeoGebraApplet.jsx'
import LazyCodeEditor from './LazyCodeEditor.jsx'

// Apartados del examen: cada uno muestra su consigna y, separada, el área de respuesta.
// No guarda estado: las respuestas llegan en `respuestas` ({ [blockId]: valor }) y cambian con `onChange`.
// Con `showAnswers={false}` (detalle del profesor) muestra solo lo que armó el profesor, sin respuesta.
export default function ExamBlocks({
  blocks,
  respuestas = {},
  onChange,
  readOnly = false,
  showCorrect = false,
  showAnswers = true,
  onGeoGebraReady,
}) {
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
      {showAnswers ? (
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
      ) : (
        <BlockSetup block={block} />
      )}
    </section>
  ))
}

// Configuración del apartado que ve el profesor: opciones, código inicial o construcción inicial.
function BlockSetup({ block }) {
  if (block.tipo === 'opcion-multiple') {
    return (
      <ul className="mc-setup">
        {block.opciones.map((opcion) => (
          <li key={opcion.id}>
            {opcion.texto}
            {opcion.correcta && <span className="chip correct">Correcta</span>}
          </li>
        ))}
      </ul>
    )
  }

  if (block.tipo === 'codigo' && block.contenido.trim()) {
    return (
      <div className="block-section">
        <span className="block-answer-label">Código inicial</span>
        <LazyCodeEditor value={block.contenido} language={block.lenguaje} label="Código inicial" readOnly />
      </div>
    )
  }

  if (block.tipo === 'geogebra' && block.ggbBase64) {
    return (
      <div className="block-section">
        <span className="block-answer-label">Construcción inicial</span>
        <GeoGebraApplet initialBase64={block.ggbBase64} readOnly />
      </div>
    )
  }

  return null
}
