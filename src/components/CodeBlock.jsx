import LazyCodeEditor from './LazyCodeEditor.jsx'
import { CODE_LANGUAGES } from '../documentBlocks.js'

export default function CodeBlock({ block, onChange }) {
  return (
    <>
      <label className="block-field">
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
      />
    </>
  )
}
