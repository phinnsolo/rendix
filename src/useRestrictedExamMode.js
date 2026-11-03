// Hook del modo restringido: monta el guardián (restrictedMode.js) mientras el examen está en curso y lo saca al
// desmontar, sin dejar listeners duplicados. Si el componente se desmonta con el examen todavía en curso (el alumno
// navegó a otra pantalla), es un incidente.

import { useEffect, useRef } from 'react'
import { RestrictedModeGuard } from './restrictedMode.js'

// Guardianes montados por sesión. En Strict Mode React monta, desmonta y vuelve a montar enseguida: el desmontaje
// intermedio no es una salida porque el guardián nuevo ya está montado cuando se revisa.
const montados = new Map()

// `verificar`: causa del incidente si al montar ya no está en pantalla completa (ej. 'PAGE_RELOAD').
export function useRestrictedExamMode({ sesionKey, verificar, onIncidente, onReportar }) {
  const guardRef = useRef(null)
  const callbacks = useRef({ onIncidente, onReportar })
  callbacks.current = { onIncidente, onReportar }

  useEffect(() => {
    const guard = new RestrictedModeGuard({
      doc: document,
      win: window,
      onIncidente: (incidente) => callbacks.current.onIncidente(incidente),
      onReportar: (incidente) => callbacks.current.onReportar(incidente),
    })
    guardRef.current = guard
    montados.set(sesionKey, (montados.get(sesionKey) ?? 0) + 1)
    document.body.classList.add('modo-restringido')
    guard.start({ verificar })
    return () => {
      montados.set(sesionKey, montados.get(sesionKey) - 1)
      document.body.classList.remove('modo-restringido')
      const seguiaActivo = guard.activo
      guard.stop()
      if (seguiaActivo) {
        setTimeout(() => {
          if (!montados.get(sesionKey)) guard.senal('NAVIGATION')
        }, 0)
      }
    }
  }, [sesionKey, verificar])

  return guardRef
}
