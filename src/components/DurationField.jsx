import { DURACION_MAXIMA } from '../config.js'

// Minutos que tiene el alumno para resolver el parcial. `value` es el texto del input.
export default function DurationField({ value, onChange }) {
  return (
    <label>
      Duración (minutos)
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={DURACION_MAXIMA}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="duration-input"
      />
      <span className="muted hint">Máximo {DURACION_MAXIMA} minutos. El tiempo corre desde que el alumno comienza el parcial.</span>
    </label>
  )
}
