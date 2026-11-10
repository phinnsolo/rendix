import { getClase } from '../clasesStore.js'
import { motivoNoPublicable } from '../documentBlocks.js'
import { confirmarTomarAhora, puedeTomarAhora, tomarAhora } from '../tomarAhora.js'

// Botón "Tomar ahora" de un parcial. No se muestra si ya se está tomando; sin clase o sin consignas, queda deshabilitado.
export default function TomarAhoraButton({ doc, onTomado, className = 'secondary' }) {
  const sinClase = !getClase(doc.claseId)
  const sinConsignas = motivoNoPublicable(doc)
  if (!sinClase && !puedeTomarAhora(doc)) return null

  async function handleClick() {
    if (!confirmarTomarAhora(doc)) return
    try {
      await tomarAhora(doc)
    } catch (e) {
      window.alert(`No se pudo tomar el parcial. ${e.message}`)
      return
    }
    onTomado()
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={sinClase || Boolean(sinConsignas)}
      title={sinClase ? 'Asignale una clase' : sinConsignas ?? 'Empieza en este momento con todos los alumnos de la clase'}
    >
      Tomar ahora
    </button>
  )
}
