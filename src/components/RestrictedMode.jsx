import { useState } from 'react'
import { request } from '../api.js'
import { getBlocks } from '../documentBlocks.js'
import { sincronizarPendientes } from '../examSecurity.js'
import { LATIDO_MS } from '../estadoExamen.js'
import { entrarPantallaCompleta, pantallaCompletaDisponible, salirPantallaCompleta } from '../restrictedMode.js'
import { usePolling } from '../usePolling.js'

// Pantallas del modo restringido del alumno: las reglas antes de empezar y el bloqueo por Incidente.

function IconoCandado() {
  return (
    <svg className="restricted-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <path d="M12 14.5v2.5" />
    </svg>
  )
}

function IconoAlerta() {
  return (
    <svg className="restricted-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5 2.8 19.5h18.4z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.4v.1" />
    </svg>
  )
}

// Reglas del modo restringido. El examen empieza recién cuando el navegador confirma la pantalla completa (pedida
// con el click en "Ingresar al examen": los navegadores no la permiten sin un gesto del usuario).
export function ReglasModoRestringido({ doc, turno, onStarted }) {
  const disponible = pantallaCompletaDisponible()
  const [acepto, setAcepto] = useState(false)
  const [paso, setPaso] = useState(null) // null | 'pantalla' | 'iniciando'
  const [error, setError] = useState('')
  const apartados = getBlocks(doc).length

  async function handleIngresar() {
    setError('')
    setPaso('pantalla')
    try {
      await entrarPantallaCompleta()
    } catch (e) {
      setError(e.message)
      setPaso(null)
      return
    }
    setPaso('iniciando')
    try {
      const { sesion } = await request('POST', `/api/examen/${doc.id}/comenzar`, { aceptoReglas: true, pantallaCompleta: true, fechaCliente: Date.now() })
      onStarted(sesion)
    } catch (e) {
      salirPantallaCompleta()
      setError(e.sinConexion ? 'Sin conexión con el servidor. Probá de nuevo.' : e.message)
      setPaso(null)
    }
  }

  return (
    <section className="card restricted-rules" aria-labelledby="restricted-title">
      <div className="restricted-title">
        <IconoCandado />
        <div>
          <h2 id="restricted-title">Modo restringido</h2>
          <p className="muted small">
            {apartados === 1 ? 'El parcial tiene 1 apartado.' : `El parcial tiene ${apartados} apartados.`}{' '}
            Es de {turno.horaInicio} a {turno.horaFin}: a las {turno.horaFin} se envía lo que hayas respondido.
          </p>
        </div>
      </div>
      <ul className="restricted-list">
        <li>El examen se hace en <strong>pantalla completa</strong>.</li>
        <li>No está permitido <strong>cambiar de pestaña o de ventana</strong>.</li>
        <li>No está permitido <strong>salir de la pantalla completa</strong> (por ejemplo, con Escape).</li>
        <li>Si querés terminar antes, usá el botón rojo <strong className="restricted-salir">SALIR</strong>.</li>
        <li>Al confirmar SALIR, el examen <strong>se entrega tal como está</strong> y no vas a poder retomarlo.</li>
        <li>
          Si el sistema detecta que abandonaste el examen sin usar SALIR, se registra un <strong>Incidente</strong> y el
          examen queda bloqueado.
        </li>
        <li>Solo tu profesor puede reanudar un examen bloqueado por Incidente.</li>
        <li>El temporizador sigue funcionando según las reglas del examen.</li>
      </ul>
      <p className="muted small">
        Tus respuestas se guardan solas mientras escribís. Si se corta la conexión o se cierra el navegador, lo último
        guardado no se pierde.
      </p>
      {!disponible && (
        <p className="error" role="alert">
          Tu navegador o su configuración no permiten la pantalla completa, así que no podés iniciar el examen desde acá.
          Probá con Chrome, Edge o Firefox actualizados.
        </p>
      )}
      <label className="checkbox restricted-accept">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} disabled={!disponible || paso !== null} />
        He leído y acepto las reglas del modo restringido.
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" onClick={handleIngresar} disabled={!acepto || !disponible || paso !== null}>
          {paso === 'pantalla' ? 'Activando pantalla completa…' : paso === 'iniciando' ? 'Ingresando…' : 'Ingresar al examen'}
        </button>
      </div>
    </section>
  )
}

// Examen interrumpido: las preguntas ya no se muestran. Se consulta el estado cada 2 s (sin recargar la página) y,
// cuando el profesor lo reanuda, el alumno vuelve con "Volver al examen" (pantalla completa otra vez).
export function ExamenInterrumpido({ parcialId, alumno, onReanudado, onFinalizado }) {
  const [remoto, setRemoto] = useState(null) // estado de la sesión en el servidor
  const [sinConexion, setSinConexion] = useState(false)
  const [volviendo, setVolviendo] = useState(false)
  const [error, setError] = useState('')

  usePolling(async () => {
    await sincronizarPendientes(alumno)
    try {
      const estado = await request('GET', `/api/examen/${parcialId}/estado`)
      setSinConexion(false)
      setRemoto(estado)
      if (!['en-curso', 'incidente'].includes(estado.estado)) onFinalizado()
    } catch (e) {
      setSinConexion(Boolean(e.sinConexion))
    }
  }, LATIDO_MS, { clave: parcialId })

  const habilitado = remoto?.estado === 'en-curso' && remoto.reingresoPendiente

  async function handleVolver() {
    setError('')
    setVolviendo(true)
    try {
      await entrarPantallaCompleta()
    } catch (e) {
      setError(e.message)
      setVolviendo(false)
      return
    }
    try {
      const { sesion } = await request('POST', `/api/examen/${parcialId}/reingresar`, { fechaCliente: Date.now() })
      onReanudado(sesion)
    } catch (e) {
      salirPantallaCompleta()
      setError(e.sinConexion ? 'Sin conexión con el servidor. Probá de nuevo.' : e.message)
      setVolviendo(false)
    }
  }

  if (habilitado) {
    return (
      <section className="card restricted-block resumed" role="alert" aria-labelledby="restricted-block-title">
        <div className="restricted-title">
          <IconoCandado />
          <h2 id="restricted-block-title">El profesor habilitó nuevamente tu examen</h2>
        </div>
        <p>
          Vas a seguir con las mismas respuestas y con el tiempo que te quedaba. El examen vuelve a estar en modo
          restringido: tiene que estar en pantalla completa.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={handleVolver} disabled={volviendo}>
            {volviendo ? 'Activando pantalla completa…' : 'Volver al examen'}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card restricted-block" role="alert" aria-labelledby="restricted-block-title">
      <div className="restricted-title">
        <IconoAlerta />
        <h2 id="restricted-block-title">Examen interrumpido</h2>
      </div>
      <p><strong>Se detectó una salida del modo restringido y el examen fue bloqueado.</strong></p>
      <p>El examen fue marcado como Incidente. Tu profesor puede autorizar que continúes: si lo hace, esta pantalla se actualiza sola.</p>
      <p className="muted small" role="status">
        {sinConexion
          ? 'Sin conexión con el servidor: el incidente se registra apenas vuelva la conexión.'
          : 'Tus respuestas guardadas hasta este momento se conservan.'}
      </p>
    </section>
  )
}
