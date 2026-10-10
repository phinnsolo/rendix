import { getClase } from '../clasesStore.js'
import { confirmarTomarAhora, puedeTomarAhora, tomarAhora } from '../tomarAhora.js'

// Botón "Tomar ahora" de un parcial. No se muestra si ya se está tomando; sin clase, queda deshabilitado.
export default function TomarAhoraButton({ doc, onTomado, className = 'secondary' }) {
  const sinClase = !getClase(doc.claseId)
  if (!sinClase && !puedeTomarAhora(doc)) return null

  function handleClick() {
    if (!confirmarTomarAhora(doc)) return
    try {
      tomarAhora(doc)
    } catch {
      window.alert('No se pudo guardar: el almacenamiento del navegador está lleno.')
      return
    }
    onTomado()
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={sinClase}
      title={sinClase ? 'Asignale una clase' : 'Empieza en este momento con todos los alumnos de la clase'}
    >
      Tomar ahora
    </button>
  )
}
