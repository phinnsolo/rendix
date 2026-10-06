import { useEffect, useRef, useState } from 'react'
import { loadGeoGebra } from '../geogebra.js'

let appletCount = 0

// Applet oficial de GeoGebra embebido en la página. Puede haber varios a la vez (cada uno con su id).
// `initialBase64` es la construcción guardada; solo se usa al montar.
// `onReady(api)` recibe la API del applet al cargar, y `onReady(null)` al desmontarse.
export default function GeoGebraApplet({ initialBase64, onReady }) {
  const containerRef = useRef(null)
  const targetRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    const container = containerRef.current
    const target = targetRef.current
    let cancelled = false
    let api = null

    // GeoGebra no se adapta solo al contenedor: se le pasa el tamaño inicial y se actualiza al redimensionar.
    const size = () => [Math.floor(container.clientWidth), Math.floor(container.clientHeight)]
    const observer = new ResizeObserver(() => {
      if (api) api.setSize(...size())
    })

    loadGeoGebra()
      .then((GGBApplet) => {
        if (cancelled) return
        const [width, height] = size()
        const applet = new GGBApplet(
          {
            id: `rendixGeoGebra${++appletCount}`,
            appName: 'suite',
            width,
            height,
            language: 'es',
            showToolBar: true,
            showAlgebraInput: true,
            showMenuBar: true,
            enableShiftDragZoom: true,
            // Sin autoescalado: el tamaño lo maneja el ResizeObserver con setSize.
            disableAutoScale: true,
            borderColor: '#FFFFFF',
            ...(initialBase64 ? { ggbBase64: initialBase64 } : {}),
            appletOnLoad: (loadedApi) => {
              if (cancelled) return
              api = loadedApi
              setStatus('ready')
              onReadyRef.current?.(loadedApi)
            },
          },
          true
        )
        applet.inject(target)
        observer.observe(container)
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      observer.disconnect()
      if (api) onReadyRef.current?.(null)
      target.replaceChildren()
    }
    // initialBase64 solo importa al crear el applet; después el estado vive dentro de GeoGebra.
  }, [])

  return (
    <div className="geogebra-applet" ref={containerRef}>
      {/* GeoGebra controla el contenido de este div; React no lo toca. */}
      <div ref={targetRef} />
      {status === 'loading' && <p className="geogebra-overlay muted">Cargando GeoGebra…</p>}
      {status === 'error' && (
        <p className="geogebra-overlay error">No se pudo cargar GeoGebra. Revisá tu conexión a internet.</p>
      )}
    </div>
  )
}
