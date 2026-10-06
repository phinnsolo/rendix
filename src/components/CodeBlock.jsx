import LazyCodeEditor from './LazyCodeEditor.jsx'
import { CODE_LANGUAGES } from '../documentBlocks.js'

// Configuración del apartado Código: lenguaje y código inicial (lo que verá el alumno al empezar).
export default function CodeBlock({ block, onChange }) {
  return (
    <>
      <label className="block-field inline">
        Lenguaje
        <select value={block.lenguaje} onChange={(e) => onChange({ lenguaje: e.target.value })}>
          {Object.entries(CODE_LANGUAGES).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </label>
      <LazyCodeEditor
        value={block.contenido}
        language={block.lenguaje}
        onChange={(contenido) => onChange({ contenido })}
        label="Código inicial"
      />
      <p className="muted hint">Código inicial opcional. El alumno responde en este editor.</p>
    </>
  )
}
