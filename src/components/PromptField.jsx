// Consigna de un apartado: lo que el profesor le pide al alumno.
export default function PromptField({ value, onChange, rows = 2, placeholder }) {
  return (
    <label className="block-field">
      Consigna
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Escribí la consigna…'}
      />
    </label>
  )
}
