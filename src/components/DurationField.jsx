import { DURACION_MAXIMA } from '../config.js'

// Minutos que tiene el alumno para resolver el parcial. `value` es el texto del input.
export default function DurationField({ value, onChange, disabled = false }) {
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
        disabled={disabled}
        className="duration-input"
      />
      <span className="muted hint">
        {disabled
          ? 'Uno de los turnos ya empezó: la duración no se puede cambiar.'
          : `Máximo ${DURACION_MAXIMA} minutos. El parcial termina a la hora de inicio del turno más la duración.`}
      </span>
    </label>
  )
}
