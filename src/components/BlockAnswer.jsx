import GeoGebraApplet from './GeoGebraApplet.jsx'
import LazyCodeEditor from './LazyCodeEditor.jsx'

// Área de respuesta del alumno para un apartado (la forma de `value` la define emptyAnswer).
// `showCorrect` marca la opción correcta en Multiple Choice (vista del profesor).
// `readOnly` muestra una respuesta ya entregada.
// En GeoGebra la respuesta vive dentro del applet: `onGeoGebraReady(api)` permite leerla al enviar.
export default function BlockAnswer({ block, value, onChange, showCorrect = false, readOnly = false, onGeoGebraReady }) {
  if (block.tipo === 'codigo') {
    return <LazyCodeEditor value={value} language={block.lenguaje} onChange={onChange} label="Respuesta" readOnly={readOnly} />
  }

  if (block.tipo === 'geogebra') {
    return <GeoGebraApplet initialBase64={value} onReady={onGeoGebraReady} readOnly={readOnly} />
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
              disabled={readOnly}
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
      placeholder={readOnly ? '(Sin respuesta)' : 'Respuesta del alumno…'}
      aria-label="Respuesta"
      readOnly={readOnly}
    />
  )
}
