import { useEffect, useRef, useState } from 'react'
import { nombreDe } from '../auth.js'
import { ZONA_HORARIA_IANA } from '../config.js'
import { EVENTOS, SENALES, esSenal } from '../estadoExamen.js'
import { nuevoEventoId } from '../examSecurity.js'
import { formatDate } from '../formatDate.js'
import { ESTADO_ALUMNO, SEGUIMIENTO_MS, detalleEstado, estadoAlumno } from '../seguimiento.js'
import { getActividadAlumno, reanudarExamen } from '../turnosStore.js'
import { usePolling } from '../usePolling.js'
import { formatRemaining } from './ExamHeader.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'

const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { timeZone: ZONA_HORARIA_IANA, hour12: false })
const restanteTexto = (ms) => formatRemaining(Math.max(0, Math.ceil((ms ?? 0) / 1000)))

// Estado del alumno con el estilo del panel.
export function EstadoChip({ estado }) {
  const { label, className } = ESTADO_ALUMNO[estado]
  return (
    <span className={className}>
      {estado === 'incidente' && <span aria-hidden="true">⚠ </span>}
      {label}
    </span>
  )
}

// Botón REANUDAR con su confirmación. Solo existe para un examen en Incidente (el servidor lo vuelve a controlar).
export function BotonReanudar({ turnoId, username, onReanudado }) {
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const eventoId = useRef(null)
  const nombre = nombreDe(username)

  async function confirmar() {
    setOcupado(true)
    setError('')
    eventoId.current ??= nuevoEventoId()
    try {
      await reanudarExamen(turnoId, username, eventoId.current)
      eventoId.current = null
      setAbierto(false)
      onReanudado?.()
    } catch (e) {
      setError(e.sinConexion ? 'Sin conexión con el servidor. Probá de nuevo.' : e.message)
      if (!e.sinConexion) eventoId.current = null
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="resume-button"
        onClick={(e) => {
          e.stopPropagation()
          setError('')
          setAbierto(true)
        }}
      >
        Reanudar
      </button>
      <ConfirmDialog
        abierto={abierto}
        titulo={`¿Reanudar el examen de ${nombre}?`}
        confirmar={ocupado ? 'Reanudando…' : 'Reanudar'}
        ocupado={ocupado}
        onConfirmar={confirmar}
        onCancelar={() => setAbierto(false)}
      >
        <p>
          {nombre} va a poder volver a entrar en pantalla completa y seguir con sus mismas respuestas y el tiempo que le
          quedaba. El incidente queda registrado.
        </p>
        {error && <p className="error">{error}</p>}
      </ConfirmDialog>
    </>
  )
}

// Texto de un evento de la línea de tiempo.
function textoEvento(ev) {
  const m = ev.metadata ?? {}
  switch (ev.tipo) {
    case 'INCIDENT':
      return `Incidente: ${SENALES[m.causa] ?? 'salida del modo restringido'} · examen bloqueado${m.restanteMs != null ? ` (quedaban ${restanteTexto(m.restanteMs)})` : ''}`
    case 'RESUMED_BY_TEACHER':
      return `Reanudado por ${m.profesorNombre ?? ev.actorNombre}${m.restanteMs != null ? ` · sigue con ${restanteTexto(m.restanteMs)}` : ''}`
    case 'FULLSCREEN_ENTERED':
      return m.reingreso ? 'Volvió a pantalla completa (reingreso)' : EVENTOS.FULLSCREEN_ENTERED
    case 'TIME_EXPIRED':
      return m.por === 'sistema' ? 'Entregado por el sistema (venció el tiempo)' : 'Entregado al llegar el tiempo a cero'
    case 'RECONNECTED':
      return `Reconexión: llegó un evento pendiente (${SENALES[m.eventoPendiente] ?? m.eventoPendiente})`
    case 'HEARTBEAT_TIMEOUT':
      return `Se perdió la señal del dispositivo${m.ultimoLatido ? ` (último latido ${hora(m.ultimoLatido)})` : ''}`
    default:
      return EVENTOS[ev.tipo] ?? ev.tipo
  }
}

function claseEvento(tipo) {
  if (tipo === 'INCIDENT') return 'timeline-item incident'
  if (tipo === 'RESUMED_BY_TEACHER') return 'timeline-item resumed'
  if (tipo === 'VOLUNTARY_EXIT') return 'timeline-item exited'
  if (['NORMAL_SUBMISSION', 'TIME_EXPIRED'].includes(tipo)) return 'timeline-item done'
  if (esSenal(tipo)) return 'timeline-item signal'
  return 'timeline-item'
}

export function LineaDeTiempo({ eventos }) {
  if (eventos.length === 0) return <p className="muted small">Todavía no hay eventos.</p>
  return (
    <ol className="timeline">
      {eventos.map((ev) => (
        <li key={ev.id} className={claseEvento(ev.tipo)}>
          <time dateTime={ev.fechaServidor} className="timeline-time">{hora(ev.fechaServidor)}</time>
          <span className="timeline-text">{textoEvento(ev)}</span>
        </li>
      ))}
    </ol>
  )
}

// Panel lateral con el detalle de un alumno: estado, horarios, reanudaciones y la línea de tiempo. Se actualiza cada
// 2 s mientras está abierto.
export default function AlumnoActividad({ turnoId, username, onCerrar, onCambio }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const ref = useRef(null)

  const refrescar = usePolling(async () => {
    try {
      setDatos(await getActividadAlumno(turnoId, username))
      setError('')
    } catch (e) {
      setError(e.sinConexion ? 'Sin conexión con el servidor: los datos pueden estar desactualizados.' : e.message)
    }
  }, SEGUIMIENTO_MS, { clave: `${turnoId}:${username}` })

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.open && dialog.close()
  }, [])

  const estado = datos ? estadoAlumno(datos, null) : null
  const eventos = datos?.eventos ?? []
  const reanudaciones = eventos.filter((e) => e.tipo === 'RESUMED_BY_TEACHER')
  const salida = eventos.find((e) => ['VOLUNTARY_EXIT', 'NORMAL_SUBMISSION', 'TIME_EXPIRED'].includes(e.tipo))
  const incidentes = eventos.filter((e) => e.tipo === 'INCIDENT')

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="drawer-title"
      onCancel={(e) => {
        e.preventDefault()
        onCerrar()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCerrar()
      }}
    >
      <div className="drawer-head">
        <div>
          <h2 id="drawer-title">{nombreDe(username)}</h2>
          <span className="muted small">{username}</span>
        </div>
        <button type="button" className="secondary drawer-close" onClick={onCerrar} aria-label="Cerrar detalle">×</button>
      </div>

      {error && <p className="error small" role="status">{error}</p>}
      {!datos ? (
        <p className="muted" role="status">Cargando…</p>
      ) : (
        <>
          <div className="drawer-estado">
            <EstadoChip estado={estado} />
            {detalleEstado(datos, Date.now()) && <span className="muted small">{detalleEstado(datos, Date.now())}</span>}
            {estado === 'incidente' && (
              <BotonReanudar
                turnoId={turnoId}
                username={username}
                onReanudado={() => {
                  refrescar()
                  onCambio?.()
                }}
              />
            )}
          </div>
          <dl className="drawer-datos">
            <dt>Inicio del examen</dt>
            <dd>{datos.sesion ? formatDate(datos.sesion.apertura) : '—'}</dd>
            <dt>Entrega</dt>
            <dd>{datos.entrega ? formatDate(datos.entrega.fechaEntrega) : '—'}</dd>
            <dt>Salida</dt>
            <dd>
              {datos.entrega?.salidaVoluntaria
                ? `Voluntaria (SALIR) · ${hora(salida?.fechaServidor ?? datos.entrega.fechaEntrega)}`
                : incidentes.length > 0
                  ? `${incidentes.length === 1 ? '1 incidente' : `${incidentes.length} incidentes`} · último ${hora(incidentes.at(-1).fechaServidor)}`
                  : salida ? `Entrega normal · ${hora(salida.fechaServidor)}` : '—'}
            </dd>
            {datos.sesion?.estado === 'incidente' && (
              <>
                <dt>Tiempo que le quedaba</dt>
                <dd>{restanteTexto(datos.sesion.restanteMs)}</dd>
              </>
            )}
            <dt>Reanudaciones</dt>
            <dd>
              {reanudaciones.length === 0
                ? 'Ninguna'
                : reanudaciones.map((r) => `${r.metadata?.profesorNombre ?? r.actorNombre} (${hora(r.fechaServidor)})`).join(' · ')}
            </dd>
          </dl>
          <h3 className="drawer-subtitle">Actividad</h3>
          <LineaDeTiempo eventos={eventos} />
        </>
      )}
    </dialog>
  )
}
