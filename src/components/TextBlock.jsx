// Texto del apartado, separado de la consigna: el material que acompaña la consigna
// (un texto para leer, analizar, completar…). El alumno responde aparte, con texto.
export default function TextBlock({ block, onChange }) {
  return (
    <label className="block-field block-section">
      Texto
      <textarea
        rows={6}
        value={block.contenido}
        onChange={(e) => onChange({ contenido: e.target.value })}
        placeholder="Contenido del apartado (opcional)…"
      />
    </label>
  )
}
