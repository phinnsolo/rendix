import GeoGebraApplet from './GeoGebraApplet.jsx'
import LazyCodeEditor from './LazyCodeEditor.jsx'

// Área de respuesta del alumno para un apartado (la forma de `value` la define emptyAnswer).
// `showCorrect` marca la opción correcta en Multiple Choice (vista del profesor).
export default function BlockAnswer({ block, value, onChange, showCorrect = false }) {
  if (block.tipo === 'codigo') {
    return <LazyCodeEditor value={value} language={block.lenguaje} onChange={onChange} label="Respuesta" />
  }

  if (block.tipo === 'geogebra') {
    // Más adelante la respuesta será la construcción del alumno (api.getBase64()).
    return <GeoGebraApplet initialBase64={block.ggbBase64} />
  }

  if (block.tipo === 'opcion-multiple') {
    return (
      <div className="mc-answer" role="radiogroup" aria-label="Respuesta">
        {block.opciones.map((opcion) => (
          <label key={opcion.id} className="checkbox">
            <input
              type="radio"
              name={`respuesta-${block.id}`}
              checked={value === opcion.id}
              onChange={() => onChange(opcion.id)}
            />
            {opcion.texto}
            {showCorrect && opcion.correcta && <span className="chip correct">Correcta</span>}
          </label>
        ))}
      </div>
    )
  }

  return (
    <textarea
      rows={4}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Respuesta del alumno…"
      aria-label="Respuesta"
    />
  )
}
