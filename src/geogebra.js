// Carga el script oficial de embed de GeoGebra una sola vez, aunque se monte varias veces la página.

const SCRIPT_URL = 'https://www.geogebra.org/apps/deployggb.js'

let loading = null

export function loadGeoGebra() {
  if (window.GGBApplet) return Promise.resolve(window.GGBApplet)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_URL
      script.async = true
      script.onload = () => resolve(window.GGBApplet)
      script.onerror = () => {
        loading = null
        script.remove()
        reject(new Error('No se pudo cargar GeoGebra'))
      }
      document.head.appendChild(script)
    })
  }
  return loading
}
