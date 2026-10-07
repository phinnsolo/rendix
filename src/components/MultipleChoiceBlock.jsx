import { createOption } from '../documentBlocks.js'

// Opciones del apartado Multiple Choice. El radio marca la respuesta correcta (una sola).
export default function MultipleChoiceBlock({ block, onChange }) {
  const { opciones } = block

  function updateOption(id, changes) {
    onChange({ opciones: opciones.map((o) => (o.id === id ? { ...o, ...changes } : o)) })
  }

  function markCorrect(id) {
    onChange({ opciones: opciones.map((o) => ({ ...o, correcta: o.id === id })) })
  }

  return (
    <fieldset className="mc-options">
      <legend className="block-field">Opciones <span className="muted">(marcá la correcta)</span></legend>
      {opciones.map((opcion, index) => (
        <div key={opcion.id} className="mc-option">
          <input
            type="radio"
            name={`correcta-${block.id}`}
            checked={opcion.correcta}
            onChange={() => markCorrect(opcion.id)}
            aria-label={`Marcar opción ${index + 1} como correcta`}
          />
          <input
            value={opcion.texto}
            onChange={(e) => updateOption(opcion.id, { texto: e.target.value })}
            placeholder={`Opción ${index + 1}`}
            aria-label={`Texto de la opción ${index + 1}`}
          />
          <button
            type="button"
            className="icon-button"
            onClick={() => onChange({ opciones: opciones.filter((o) => o.id !== opcion.id) })}
            disabled={opciones.length <= 2}
            aria-label={`Eliminar opción ${index + 1}`}
            title="Eliminar opción"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="link-button"
        onClick={() => onChange({ opciones: [...opciones, createOption()] })}
      >
        + Agregar opción
      </button>
    </fieldset>
  )
}
