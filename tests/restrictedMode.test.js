// Detección del modo restringido en el navegador (src/restrictedMode.js) y registro de incidentes con cola local
// (src/examSecurity.js), con un document y un window falsos.
//   npm test
import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { RestrictedModeGuard, entrarPantallaCompleta } from '../src/restrictedMode.js'

class DocFalso extends EventTarget {
  constructor() {
    super()
    this.fullscreenEnabled = true
    this.fullscreenElement = null
    this.visibilityState = 'visible'
    this.foco = true
    this.activeElement = { tagName: 'BODY' }
    const doc = this
    this.documentElement = {
      requestFullscreen() {
        doc.pedidos = (doc.pedidos ?? 0) + 1
        return Promise.resolve()
      },
    }
  }
  hasFocus() {
    return this.foco
  }
  entrar() {
    this.fullscreenElement = this.documentElement
    this.dispatchEvent(new Event('fullscreenchange'))
  }
  salir() {
    this.fullscreenElement = null
    this.dispatchEvent(new Event('fullscreenchange'))
  }
  ocultar() {
    this.visibilityState = 'hidden'
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

function armar({ fullscreen = true } = {}) {
  const doc = new DocFalso()
  const win = new EventTarget()
  if (fullscreen) doc.fullscreenElement = doc.documentElement
  const incidentes = []
  const reportes = []
  const guard = new RestrictedModeGuard({
    doc, win, confirmarBlurMs: 20, agruparMs: 30,
    onIncidente: (i) => incidentes.push({ ...i, senales: [...i.senales] }),
    onReportar: (i) => reportes.push(i),
  })
  return { doc, win, guard, incidentes, reportes }
}

describe('guardián del modo restringido', () => {
  test('2. sin pantalla completa no se puede ver el examen: al montar fuera de pantalla completa es un incidente', () => {
    const { guard, incidentes } = armar({ fullscreen: false })
    guard.start({ verificar: 'PAGE_RELOAD' })
    assert.equal(incidentes.length, 1)
    assert.equal(incidentes[0].causa, 'PAGE_RELOAD')
    guard.stop()
  })

  test('en pantalla completa y visible no hay incidente al empezar', () => {
    const { guard, incidentes } = armar()
    guard.start({ verificar: 'PAGE_RELOAD' })
    assert.equal(incidentes.length, 0)
    assert.equal(guard.activo, true)
    guard.stop()
  })

  test('3. salir de pantalla completa → incidente inmediato (oculta en el mismo evento) y un reporte', async () => {
    const { doc, guard, incidentes, reportes } = armar()
    guard.start()
    const t0 = performance.now()
    doc.salir()
    assert.equal(incidentes.length, 1) // sincrónico: el examen se oculta en el mismo evento
    assert.equal(incidentes[0].causa, 'FULLSCREEN_EXIT')
    await esperar(60)
    assert.equal(reportes.length, 1)
    assert.ok(performance.now() - t0 < 1000)
    guard.stop()
  })

  test('4. pestaña oculta → incidente y reporte sin esperar (la página puede cerrarse)', () => {
    const { doc, guard, incidentes, reportes } = armar()
    guard.start()
    doc.ocultar()
    assert.equal(incidentes[0].causa, 'VISIBILITY_HIDDEN')
    assert.equal(reportes.length, 1)
    assert.equal(reportes[0].urgente, true)
    guard.stop()
  })

  test('5. fullscreenchange + visibilitychange + blur de la misma salida → un solo incidente con las tres señales', async () => {
    const { doc, win, guard, incidentes, reportes } = armar()
    guard.start()
    doc.salir()
    doc.foco = false
    win.dispatchEvent(new Event('blur'))
    await esperar(25) // se confirma el blur
    doc.ocultar()
    win.dispatchEvent(new Event('blur'))
    await esperar(60)
    assert.equal(incidentes.length, 1)
    assert.equal(reportes.length, 1)
    assert.deepEqual(reportes[0].senales.map((s) => s.tipo), ['FULLSCREEN_EXIT', 'WINDOW_BLUR', 'VISIBILITY_HIDDEN'])
    guard.stop()
  })

  test('7. la salida de pantalla completa provocada por SALIR no es un incidente', async () => {
    const { doc, win, guard, incidentes, reportes } = armar()
    guard.start()
    assert.equal(guard.comenzarSalida(), true) // voluntaryExitInProgress = true, antes de salir de pantalla completa
    doc.salir()
    doc.ocultar()
    win.dispatchEvent(new Event('pagehide'))
    guard.terminar() // el servidor confirmó la salida
    doc.entrar()
    doc.salir()
    await esperar(60)
    assert.equal(incidentes.length, 0)
    assert.equal(reportes.length, 0)
    guard.stop()
  })

  test('si SALIR falla mientras estaba fuera de pantalla completa, al cancelar es un incidente', () => {
    const { doc, guard, incidentes } = armar()
    guard.start()
    guard.comenzarSalida()
    doc.salir()
    assert.equal(incidentes.length, 0)
    guard.cancelarSalida()
    assert.equal(incidentes.length, 1)
    assert.equal(incidentes[0].causa, 'FULLSCREEN_EXIT')
    guard.stop()
  })

  test('después de un incidente no se puede usar SALIR', () => {
    const { doc, guard } = armar()
    guard.start()
    doc.salir()
    assert.equal(guard.comenzarSalida(), false)
    guard.stop()
  })

  test('un blur que no se confirma (vuelve el foco, o el foco está en un iframe de la página) no es incidente', async () => {
    const { doc, win, guard, incidentes } = armar()
    guard.start()
    win.dispatchEvent(new Event('blur'))
    await esperar(40) // doc.foco sigue en true
    doc.foco = false
    doc.activeElement = { tagName: 'IFRAME' }
    win.dispatchEvent(new Event('blur'))
    await esperar(40)
    assert.equal(incidentes.length, 0)
    doc.activeElement = { tagName: 'BODY' }
    win.dispatchEvent(new Event('blur'))
    await esperar(40)
    assert.equal(incidentes.length, 1)
    assert.equal(incidentes[0].causa, 'WINDOW_BLUR')
    guard.stop()
  })

  test('stop saca los listeners: no quedan handlers duplicados', () => {
    const { doc, guard, incidentes } = armar()
    guard.start()
    guard.start() // un segundo start no agrega listeners
    guard.stop()
    doc.salir()
    assert.equal(incidentes.length, 0)
  })

  test('stop con un reporte esperando a juntar señales lo manda enseguida', () => {
    const { doc, guard, reportes } = armar()
    guard.start()
    doc.salir()
    assert.equal(reportes.length, 0)
    guard.stop()
    assert.equal(reportes.length, 1)
  })
})

describe('pantalla completa', () => {
  test('1. INGRESAR espera la confirmación real de pantalla completa', async () => {
    const doc = new DocFalso()
    let listo = false
    const promesa = entrarPantallaCompleta(doc).then(() => {
      listo = true
    })
    await esperar(10)
    assert.equal(doc.pedidos, 1)
    assert.equal(listo, false) // requestFullscreen resolvió, pero todavía no hubo fullscreenchange
    doc.entrar()
    await promesa
    assert.equal(listo, true)
  })

  test('fullscreenerror → error con explicación', async () => {
    const doc = new DocFalso()
    const promesa = entrarPantallaCompleta(doc)
    doc.dispatchEvent(new Event('fullscreenerror'))
    await assert.rejects(promesa, (e) => e.motivo === 'rechazada' && /rechazó/.test(e.message))
  })

  test('document.fullscreenEnabled === false → no se puede iniciar', async () => {
    const doc = new DocFalso()
    doc.fullscreenEnabled = false
    await assert.rejects(entrarPantallaCompleta(doc), (e) => e.motivo === 'no-disponible')
    assert.equal(doc.pedidos, undefined)
  })
})

describe('registro de incidentes desde el navegador', () => {
  const almacen = () => {
    const datos = new Map()
    return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)), removeItem: (k) => datos.delete(k) }
  }
  let pedidos
  let sinRed
  let seguridad

  beforeEach(async () => {
    globalThis.sessionStorage = almacen()
    globalThis.localStorage = almacen()
    globalThis.window ??= new EventTarget()
    pedidos = []
    sinRed = false
    globalThis.fetch = async (url, opciones) => {
      pedidos.push({ url, body: JSON.parse(opciones.body), keepalive: opciones.keepalive })
      if (sinRed) throw new TypeError('Failed to fetch')
      return { ok: true, status: 200, json: async () => ({ estado: 'incidente', serverNow: Date.now() }) }
    }
    seguridad = await import('../src/examSecurity.js')
    seguridad._reiniciarIncidentes()
  })

  test('5 / 20. varias llamadas para la misma sesión (señales, Strict Mode) mandan un solo pedido', async () => {
    const datos = { parcialId: 'p1', alumno: 'alumno1', sesionKey: 's1:0', causa: 'FULLSCREEN_EXIT', respuestas: { b1: '4' }, seq: 3 }
    const [a, b] = await Promise.all([seguridad.triggerExamIncident(datos), seguridad.triggerExamIncident({ ...datos, causa: 'VISIBILITY_HIDDEN' })])
    assert.equal(pedidos.length, 1)
    assert.equal(a, b)
    assert.equal(pedidos[0].url, '/api/examen/p1/incidente')
    assert.deepEqual(pedidos[0].body.respuestas, { b1: '4' }) // flush de las respuestas en el mismo pedido
    // Después de una reanudación es otro tramo: puede haber otro incidente.
    await seguridad.triggerExamIncident({ ...datos, sesionKey: 's1:1' })
    assert.equal(pedidos.length, 2)
  })

  test('sin conexión el evento queda en la cola local y se manda al volver la red, con la misma clave', async () => {
    // Al abrir la página la cola está vacía: eso no tiene que trabar las sincronizaciones siguientes.
    await seguridad.sincronizarPendientes('alumno1')
    sinRed = true
    const r = await seguridad.triggerExamIncident({ parcialId: 'p2', alumno: 'alumno1', sesionKey: 's2:0', causa: 'VISIBILITY_HIDDEN', urgente: true })
    assert.equal(r, null)
    assert.equal(pedidos[0].keepalive, true)
    const cola = seguridad.leerCola('alumno1')
    assert.equal(cola.length, 1)
    sinRed = false
    await seguridad.sincronizarPendientes('alumno1')
    assert.equal(pedidos.length, 2)
    assert.equal(pedidos[1].body.eventoId, pedidos[0].body.eventoId)
    assert.equal(pedidos[1].body.diferido, true)
    assert.equal(seguridad.leerCola('alumno1').length, 0)
  })
})
