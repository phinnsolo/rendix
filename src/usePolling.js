import { useEffect, useRef } from 'react'

// Ejecuta `tarea` (async) cada `ms` sin superponer pedidos: la siguiente empieza recién cuando termina la anterior,
// y si una tarda más que `ms` la siguiente sale enseguida. Se reinicia cuando cambia `clave` y se detiene al
// desmontar o con `activo` en false. Devuelve una función para pedir una actualización ya (ej. después de una acción).
export function usePolling(tarea, ms, { activo = true, clave = null } = {}) {
  const tareaRef = useRef(tarea)
  tareaRef.current = tarea
  const ahoraRef = useRef(() => {})

  useEffect(() => {
    if (!activo) return
    let vivo = true
    let timer = null
    let enCurso = null
    const ciclo = async () => {
      clearTimeout(timer)
      if (enCurso) return enCurso
      const inicio = performance.now()
      enCurso = (async () => {
        try {
          await tareaRef.current()
        } catch {
          // Cada tarea muestra sus propios errores; el polling sigue.
        }
      })()
      await enCurso
      enCurso = null
      if (vivo) timer = setTimeout(ciclo, Math.max(0, ms - (performance.now() - inicio)))
    }
    ahoraRef.current = ciclo
    ciclo()
    return () => {
      vivo = false
      clearTimeout(timer)
      ahoraRef.current = () => {}
    }
  }, [ms, activo, clave])

  return () => ahoraRef.current()
}
