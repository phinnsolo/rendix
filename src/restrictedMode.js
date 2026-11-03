// Modo restringido en el navegador: pantalla completa y detección de salidas.
//
// Una página web no puede impedir Escape, Alt+Tab ni que se cierre el navegador. La estrategia es
// DETECTAR → OCULTAR → REGISTRAR → BLOQUEAR: el guardián escucha las señales del navegador y, a la primera, avisa
// para ocultar el examen (onIncidente, en el mismo evento) y para registrarlo en el servidor (onReportar). Una
// misma salida dispara varias señales casi juntas (fullscreenchange, visibilitychange, blur): se agrupan en un
// solo incidente. Mientras se procesa una salida voluntaria (SALIR) o una entrega, las señales se ignoran.
//
// No depende de React: recibe el document y el window, así se puede probar con objetos falsos.

// Tiempo para confirmar una pérdida de foco (un blur seguido de foco enseguida no es un cambio de ventana).
export const CONFIRMAR_BLUR_MS = 250
// Señales que llegan en este tiempo después de la primera se mandan en el mismo reporte.
export const AGRUPAR_SENALES_MS = 200
// Con estas señales la página puede estar por cerrarse: se reporta sin esperar.
const URGENTES = new Set(['VISIBILITY_HIDDEN', 'PAGE_EXIT', 'NAVIGATION'])

export function enPantallaCompleta(doc = document) {
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement)
}

// false si el navegador (o su configuración, o un iframe sin permiso) no permite pantalla completa.
export function pantallaCompletaDisponible(doc = document) {
  return Boolean(doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled)
}

export class ErrorPantallaCompleta extends Error {
  constructor(motivo) {
    super(
      motivo === 'no-disponible'
        ? 'Tu navegador o su configuración no permiten la pantalla completa, y el examen solo se puede hacer en pantalla completa. Probá con Chrome, Edge o Firefox actualizados, fuera de cualquier ventana embebida.'
        : 'El navegador rechazó la pantalla completa. Volvé a intentarlo con el botón; si el problema sigue, revisá que el navegador no tenga bloqueada la pantalla completa para este sitio.'
    )
    this.motivo = motivo
  }
}

// Pide pantalla completa (tiene que llamarse desde un click: los navegadores exigen un gesto del usuario) y espera
// la confirmación real (fullscreenchange con fullscreenElement). Rechaza con ErrorPantallaCompleta si el navegador
// la rechaza (fullscreenerror) o no la permite.
export function entrarPantallaCompleta(doc = document, { esperaMs = 3000 } = {}) {
  if (!pantallaCompletaDisponible(doc)) return Promise.reject(new ErrorPantallaCompleta('no-disponible'))
  if (enPantallaCompleta(doc)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const el = doc.documentElement
    const listo = () => {
      if (!enPantallaCompleta(doc)) return
      limpiar()
      resolve()
    }
    const fallo = () => {
      limpiar()
      reject(new ErrorPantallaCompleta('rechazada'))
    }
    const timer = setTimeout(fallo, esperaMs)
    function limpiar() {
      clearTimeout(timer)
      for (const prefijo of ['', 'webkit']) {
        doc.removeEventListener(`${prefijo}fullscreenchange`, listo)
        doc.removeEventListener(`${prefijo}fullscreenerror`, fallo)
      }
    }
    for (const prefijo of ['', 'webkit']) {
      doc.addEventListener(`${prefijo}fullscreenchange`, listo)
      doc.addEventListener(`${prefijo}fullscreenerror`, fallo)
    }
    try {
      const pedir = el.requestFullscreen ?? el.webkitRequestFullscreen
      const promesa = pedir.call(el, { navigationUI: 'hide' })
      promesa?.catch?.(fallo)
    } catch {
      fallo()
    }
  })
}

export function salirPantallaCompleta(doc = document) {
  if (!enPantallaCompleta(doc)) return
  try {
    const salir = doc.exitFullscreen ?? doc.webkitExitFullscreen
    salir.call(doc)?.catch?.(() => {})
  } catch {
    // Ya no estaba en pantalla completa.
  }
}

// Estados: 'inactivo' → 'activo' → ('interrumpido' | 'saliendo' → 'terminado').
export class RestrictedModeGuard {
  constructor({ doc, win, onIncidente, onReportar, confirmarBlurMs = CONFIRMAR_BLUR_MS, agruparMs = AGRUPAR_SENALES_MS, ahora = () => Date.now() }) {
    this.doc = doc
    this.win = win
    this.onIncidente = onIncidente
    this.onReportar = onReportar
    this.confirmarBlurMs = confirmarBlurMs
    this.agruparMs = agruparMs
    this.ahora = ahora
    this.estado = 'inactivo'
    this.incidente = null // { causa, senales: [{ tipo, fechaCliente }], reportado }
    this.timers = new Set()
    this.handlers = {
      fullscreen: () => {
        if (!enPantallaCompleta(this.doc)) this.senal('FULLSCREEN_EXIT')
      },
      visibilidad: () => {
        if (this.doc.visibilityState === 'hidden') this.senal('VISIBILITY_HIDDEN')
      },
      blur: () => {
        this.programar(() => {
          // El foco puede estar en un iframe de la propia página (ej. una herramienta): no es un cambio de ventana.
          const enIframe = this.doc.activeElement?.tagName === 'IFRAME'
          if (!this.doc.hasFocus() && !enIframe) this.senal('WINDOW_BLUR')
        }, this.confirmarBlurMs)
      },
      pagehide: () => this.senal('PAGE_EXIT'),
    }
  }

  // Empieza a vigilar. Con `verificar`, si ya no está en pantalla completa o la página no está visible (ej. se
  // recargó durante el examen), es un incidente con esa causa.
  start({ verificar = null } = {}) {
    if (this.estado !== 'inactivo') return
    this.estado = 'activo'
    for (const prefijo of ['', 'webkit']) this.doc.addEventListener(`${prefijo}fullscreenchange`, this.handlers.fullscreen)
    this.doc.addEventListener('visibilitychange', this.handlers.visibilidad)
    this.win.addEventListener('blur', this.handlers.blur)
    this.win.addEventListener('pagehide', this.handlers.pagehide)
    if (verificar && (!enPantallaCompleta(this.doc) || this.doc.visibilityState === 'hidden')) this.senal(verificar)
  }

  stop() {
    for (const prefijo of ['', 'webkit']) this.doc.removeEventListener(`${prefijo}fullscreenchange`, this.handlers.fullscreen)
    this.doc.removeEventListener('visibilitychange', this.handlers.visibilidad)
    this.win.removeEventListener('blur', this.handlers.blur)
    this.win.removeEventListener('pagehide', this.handlers.pagehide)
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    // Si el reporte estaba esperando a juntar señales, sale ahora.
    if (this.incidente && !this.incidente.reportado) this.reportar()
  }

  get activo() {
    return this.estado === 'activo'
  }

  // Una señal de abandono. Solo la primera (estando activo) genera el incidente; las demás se agregan a ese.
  senal(tipo) {
    if (this.estado === 'interrumpido') {
      if (!this.incidente.senales.some((s) => s.tipo === tipo)) this.incidente.senales.push({ tipo, fechaCliente: this.ahora() })
      if (!this.incidente.reportado && URGENTES.has(tipo)) this.reportar()
      return
    }
    if (this.estado !== 'activo') return
    this.estado = 'interrumpido'
    this.incidente = { causa: tipo, senales: [{ tipo, fechaCliente: this.ahora() }], reportado: false }
    this.onIncidente?.(this.incidente)
    if (URGENTES.has(tipo)) this.reportar()
    else this.programar(() => this.reportar(), this.agruparMs)
  }

  reportar() {
    if (!this.incidente || this.incidente.reportado) return
    this.incidente.reportado = true
    this.onReportar?.({ ...this.incidente, urgente: URGENTES.has(this.incidente.causa) || this.incidente.senales.some((s) => URGENTES.has(s.tipo)) })
  }

  // SALIR o entrega: desde acá, salir de pantalla completa no es un incidente. Devuelve false si ya había un incidente.
  comenzarSalida() {
    if (this.estado !== 'activo') return false
    this.estado = 'saliendo'
    return true
  }

  // La salida o la entrega no se pudo completar: se vuelve a vigilar y, si mientras tanto salió de pantalla completa,
  // es un incidente.
  cancelarSalida() {
    if (this.estado !== 'saliendo') return
    this.estado = 'activo'
    if (!enPantallaCompleta(this.doc)) this.senal('FULLSCREEN_EXIT')
    else if (this.doc.visibilityState === 'hidden') this.senal('VISIBILITY_HIDDEN')
  }

  // El servidor confirmó la entrega o la salida (o el examen terminó por otro motivo): no se vigila más.
  terminar() {
    this.estado = 'terminado'
  }

  programar(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(t)
      fn()
    }, ms)
    this.timers.add(t)
  }
}
