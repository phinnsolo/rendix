export default function TextBlock({ block, onChange, label }) {
  return (
    <textarea
      rows={6}
      value={block.contenido}
      onChange={(e) => onChange({ contenido: e.target.value })}
      placeholder="Escribí el enunciado, la consigna o una explicación…"
      aria-label={label}
    />
  )
}
