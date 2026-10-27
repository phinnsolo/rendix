import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { nombreDe } from '../auth.js'
import { now } from '../clock.js'
import { ZONA_HORARIA_IANA } from '../config.js'
import { formatRemaining } from '../components/ExamHeader.jsx'
import {
  ESTADO_ALUMNO, SEGUIMIENTO_MS, estadoAlumno, haceCuanto, progreso, ultimaActualizacion,
} from '../seguimiento.js'
import { formatHorario, getMonitoreo, turnoFin } from '../turnosStore.js'

// Primero los que pueden tener un problema, después los que están rindiendo y al final los que terminaron.
const ORDEN = ['desconectado', 'en-linea', 'no-abrio', 'no-completo', 'entregado-sistema', 'entregado-tiempo', 'entregado']

const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { timeZone: ZONA_HORARIA_IANA, hour12: false })

// Turnos del profesor que se están tomando ahora: tiempo restante, quién está en línea, quién se desconectó
// y quién tiene cambios sin sincronizar. Se pide al servidor cada 2 s; el tiempo corre con la hora del servidor.
export default function MonitoreoPage() {
  const [turnos, setTurnos] = useState(null)
  const [sinConexion, setSinConexion] = useState(false)
  const [ahora, setAhora] = useState(now)

  const refresh = useCallback(() => {
    getMonitoreo().then(
      (datos) => {
        setTurnos(datos.turnos)
        setSinConexion(false)
      },
      () => setSinConexion(true)
    )
  }, [])
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, SEGUIMIENTO_MS)
    return () => clearInterval(timer)
  }, [refresh])
  useEffect(() => {
    const timer = setInterval(() => setAhora(now()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <>
      <h1>Monitoreo</h1>
      <p className="muted">Parciales que se están tomando ahora. La información se actualiza sola cada 2 segundos.</p>
      {turnos === null ? (
        <p className="muted" role="status">{sinConexion ? 'Sin conexión con el servidor. Reintentando…' : 'Cargando…'}</p>
      ) : turnos.length === 0 ? (
        <div className="card monitor-empty">
          <p>No hay parciales en curso ahora.</p>
          <Link to="/documentos" className="button secondary">Ir a parciales</Link>
        </div>
      ) : (
        <>
          {sinConexion && <p className="error" role="status">Sin conexión con el servidor: los datos pueden estar desactualizados.</p>}
          {turnos.map((turno) => <PanelTurno key={turno.id} turno={turno} ahora={ahora} />)}
        </>
      )}
    </>
  )
}

function PanelTurno({ turno, ahora }) {
  const restante = Math.max(0, Math.ceil((turnoFin(turno).getTime() - ahora) / 1000))
  const filas = turno.alumnos
    .map((a) => ({ ...a, nombre: nombreDe(a.username), estado: estadoAlumno(a, 'en-curso', ahora) }))
    .sort((a, b) =>
      ORDEN.indexOf(a.estado) - ORDEN.indexOf(b.estado) ||
      Number(Boolean(b.sesion?.pendientes)) - Number(Boolean(a.sesion?.pendientes)) ||
      a.nombre.localeCompare(b.nombre, 'es', { numeric: true })
    )
  const pendientes = filas.filter((f) => f.sesion?.pendientes && !f.entrega).length
  const enLinea = filas.filter((f) => f.estado === 'en-linea').length
  const entregaron = filas.filter((f) => f.entrega).length

  return (
    <section className="card monitor" aria-labelledby={`monitor-${turno.id}`}>
      <div className="monitor-head">
        <h2 id={`monitor-${turno.id}`}>
          <Link to={`/documentos/${turno.parcialId}/turnos/${turno.id}`}>{turno.titulo}</Link>
        </h2>
        <p className="muted small">{formatHorario(turno)}</p>
      </div>

      <div className="monitor-stats">
        <div className="monitor-stat">
          <IconoReloj />
          <div>
            <span className="monitor-stat-label">Tiempo restante del turno</span>
            <span className={`monitor-stat-value ${restante <= 60 ? 'urgent' : restante <= 600 ? 'warning' : ''}`}>
              {formatRemaining(restante)}
            </span>
          </div>
        </div>
        <div className={pendientes > 0 ? 'monitor-stat pending' : 'monitor-stat'}>
          <IconoCampana />
          <div>
            <span className="monitor-stat-label">Cambios pendientes</span>
            <span className="monitor-stat-value">{pendientes}</span>
            <span className="monitor-stat-note">
              {enLinea} en línea · {entregaron} de {filas.length} entregaron
            </span>
          </div>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="muted">Este turno no tiene alumnos asignados.</p>
      ) : (
        <div className="table-scroll">
          <table className="monitor-table">
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Estado</th>
                <th>Última actualización</th>
                <th aria-label="Cambios pendientes" />
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <FilaAlumno key={fila.username} fila={fila} turno={turno} ahora={ahora} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function FilaAlumno({ fila, turno, ahora }) {
  const ultima = ultimaActualizacion(fila)
  const pendiente = fila.sesion?.pendientes && !fila.entrega
  const usado = Math.round(progreso(fila, turno, ahora) * 100)

  return (
    <tr className={`monitor-row ${fila.estado}`}>
      <td>
        {fila.nombre}
        <span className="muted small table-sub">{fila.username}</span>
      </td>
      <td className="monitor-estado">
        <span className="monitor-estado-label">
          <span className="monitor-dot" aria-hidden="true" />
          {ESTADO_ALUMNO[fila.estado].label}
        </span>
        <span className="monitor-bar" role="progressbar" aria-label="Tiempo del turno que ya pasó" aria-valuenow={usado} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${usado}%` }} />
        </span>
      </td>
      <td className="monitor-num">
        {ultima ? (
          <>
            {hora(ultima)}
            <span className="muted small table-sub">{haceCuanto(ultima, ahora)}</span>
          </>
        ) : '—'}
      </td>
      <td className="monitor-pending-cell">
        {pendiente && <span className="monitor-pending" role="img" aria-label="Cambios pendientes de sincronizar" title="Cambios pendientes de sincronizar" />}
      </td>
    </tr>
  )
}

// Íconos de trazo, con el color del texto.
function Icono({ children }) {
  return (
    <svg className="monitor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

function IconoReloj() {
  return <Icono><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icono>
}

function IconoCampana() {
  return <Icono><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></Icono>
}
