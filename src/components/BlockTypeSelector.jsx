import { BLOCK_TYPES } from '../documentBlocks.js'

// Select que funciona como menú: al elegir un tipo se agrega el apartado y vuelve a "+ Agregar apartado".
export default function BlockTypeSelector({ onSelect }) {
  return (
    <select
      className="block-add"
      value=""
      onChange={(e) => onSelect(e.target.value)}
      aria-label="Agregar apartado"
    >
      <option value="" disabled>+ Agregar apartado</option>
      {Object.entries(BLOCK_TYPES).map(([tipo, label]) => (
        <option key={tipo} value={tipo}>{label}</option>
      ))}
    </select>
  )
}
