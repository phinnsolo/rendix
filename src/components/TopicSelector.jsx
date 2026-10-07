import { TEMAS } from '../config.js'

// Desplegable de temas. Lo usa el profesor al armar el examen; está pensado para reutilizarse
// cuando exista la elección de tema antes de comenzar un examen.
export default function TopicSelector({ value, onChange, label = 'Tema' }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>Elegí un tema</option>
        {TEMAS.map((tema) => (
          <option key={tema} value={tema}>{tema}</option>
        ))}
      </select>
    </label>
  )
}
