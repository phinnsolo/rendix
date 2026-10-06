import { HERRAMIENTAS } from '../config.js'

export default function AllowedToolsSelector({ value, onChange }) {
  return (
    <fieldset className="tools-selector">
      <legend>Herramientas permitidas</legend>
      <p className="muted small">Recursos que el alumno puede usar durante todo el examen.</p>
      <div className="tools-options">
        {Object.entries(HERRAMIENTAS).map(([key, label]) => (
          <label key={key} className="checkbox tool-option">
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
