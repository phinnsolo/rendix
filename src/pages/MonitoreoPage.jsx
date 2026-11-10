import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { nombreDe } from '../auth.js'
import { now } from '../clock.js'
import { ZONA_HORARIA_IANA } from '../config.js'
import { formatRemaining } from '../components/ExamHeader.jsx'
import AlumnoActividad, { BotonReanudar, EstadoChip } from '../components/AlumnoActividad.jsx'
import {
  SEGUIMIENTO_MS, detalleEstado, estadoAlumno, haceCuanto, progreso, ultimaActualizacion,
} from '../seguimiento.js'
import { formatHorario, getMonitoreo, turnoFin } from '../turnosStore.js'
import { usePolling } from '../usePolling.js'

// Primero los incidentes (requieren una decisión del profesor), después los que están rindiendo y al final los que
// terminaron.
const ORDEN = ['incidente', 'en-curso', 'no-abrio', 'no-completo', 'entregado-sistema', 'salio-entrego', 'entregado']

const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { timeZone: ZONA_HORARIA_IANA, hour12: false })

// Turnos del profesor que se están tomando ahora: tiempo restante, estado de cada alumno en el modo restringido
// (En curso, Entregado, Salió y se entregó, Incidente) y quién tiene cambios sin sincronizar. Se pide al servidor
// cada 2 s sin superponer pedidos; el tiempo corre con la hora del servidor. Click en un alumno: su actividad.
export default function MonitoreoPage() {
  const [turnos, setTurnos] = useState(null)
  const [sinConexion, setSinConexion] = useState(false)
  const [ahora, setAhora] = useState(now)
  const [detalle, setDetalle] = useState(null) // { turnoId, username }

  const refresh = usePolling(async () => {
    try {
      const datos = await getMonitoreo()
      setTurnos(datos.turnos)
      setSinConexion(false)
    } catch {
      setSinConexion(true)
    }
  }, SEGUIMIENTO_MS)
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
          {turnos.map((turno) => (
            <PanelTurno
              key={turno.id}
              turno={turno}
              ahora={ahora}
              onDetalle={(username) => setDetalle({ turnoId: turno.id, username })}
              onCambio={refresh}
            />
          ))}
        </>
      )}
      {detalle && (
        <AlumnoActividad
          key={`${detalle.turnoId}:${detalle.username}`}
          turnoId={detalle.turnoId}
          username={detalle.username}
          onCerrar={() => setDetalle(null)}
          onCambio={refresh}
        />
      )}
    </>
  )
}

function PanelTurno({ turno, ahora, onDetalle, onCambio }) {
  const restante = Math.max(0, Math.ceil((turnoFin(turno).getTime() - ahora) / 1000))
  const filas = turno.alumnos
    .map((a) => ({ ...a, nombre: nombreDe(a.username), estado: estadoAlumno(a, 'en-curso') }))
    .sort((a, b) =>
      ORDEN.indexOf(a.estado) - ORDEN.indexOf(b.estado) ||
      Number(Boolean(b.sesion?.pendientes)) - Number(Boolean(a.sesion?.pendientes)) ||
      a.nombre.localeCompare(b.nombre, 'es', { numeric: true })
    )
  const pendientes = filas.filter((f) => f.sesion?.pendientes && f.estado === 'en-curso').length
  const enCurso = filas.filter((f) => f.estado === 'en-curso').length
  const entregaron = filas.filter((f) => f.entrega).length
  const incidentes = filas.filter((f) => f.estado === 'incidente').length

  return (
    <section className="card monitor" aria-labelledby={`monitor-${turno.id}`}>
      <div className="monitor-head">
        <h2 id={`monitor-${turno.id}`}>
          <Link to={`/documentos/${turno.parcialId}/turnos/${turno.id}`}>{turno.titulo}</Link>
        </h2>
        <p className="muted small">{formatHorario(turno)}</p>
      </div>

      <div className="monitor-stats three">
        <div className="monitor-stat">
          <IconoReloj />
          <div>
            <span className="monitor-stat-label">Tiempo restante del turno</span>
            <span className={`monitor-stat-value ${restante <= 60 ? 'urgent' : restante <= 600 ? 'warning' : ''}`}>
              {formatRemaining(restante)}
            </span>
          </div>
        </div>
        <div className={incidentes > 0 ? 'monitor-stat incident' : 'monitor-stat'}>
          <IconoAlerta />
          <div>
            <span className="monitor-stat-label">Incidentes</span>
            <span className="monitor-stat-value">{incidentes}</span>
            <span className="monitor-stat-note">{incidentes > 0 ? 'Esperan tu decisión' : 'Sin salidas del modo restringido'}</span>
          </div>
        </div>
        <div className={pendientes > 0 ? 'monitor-stat pending' : 'monitor-stat'}>
          <IconoCampana />
          <div>
            <span className="monitor-stat-label">Cambios pendientes</span>
            <span className="monitor-stat-value">{pendientes}</span>
            <span className="monitor-stat-note">
              {enCurso} en curso · {entregaron} de {filas.length} entregaron
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
                <th>Nombre</th>
                <th>Estado</th>
                <th>Última actividad</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <FilaAlumno key={fila.username} fila={fila} turno={turno} ahora={ahora} onDetalle={onDetalle} onCambio={onCambio} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function FilaAlumno({ fila, turno, ahora, onDetalle, onCambio }) {
  const ultima = ultimaActualizacion(fila)
  const pendiente = fila.sesion?.pendientes && fila.estado === 'en-curso'
  const usado = Math.round(progreso(fila, turno, ahora) * 100)
  const detalle = detalleEstado(fila, ahora)
  const abrir = () => onDetalle(fila.username)

  return (
    <tr className={`monitor-row ${fila.estado}`} onClick={abrir}>
      <td>
        <button type="button" className="link-button monitor-name" onClick={(e) => { e.stopPropagation(); abrir() }}>
          {fila.nombre}
        </button>
        <span className="muted small table-sub">{fila.username}</span>
      </td>
      <td className="monitor-estado">
        <span className="monitor-estado-label">
          <span className="monitor-dot" aria-hidden="true" />
          <EstadoChip estado={fila.estado} />
          {pendiente && <span className="monitor-pending" role="img" aria-label="Cambios pendientes de sincronizar" title="Cambios pendientes de sincronizar" />}
        </span>
        {detalle && <span className="muted small table-sub">{detalle}</span>}
        <span className="monitor-bar" role="progressbar" aria-label="Tiempo que ya pasó" aria-valuenow={usado} aria-valuemin={0} aria-valuemax={100}>
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
      <td onClick={(e) => e.stopPropagation()}>
        <div className="table-actions">
          {fila.estado === 'incidente' && <BotonReanudar turnoId={turno.id} username={fila.username} onReanudado={onCambio} />}
          <button type="button" className="secondary" onClick={abrir}>Ver actividad</button>
        </div>
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

function IconoAlerta() {
  return <Icono><path d="M12 3.5 2.8 19.5h18.4z" /><path d="M12 10v4.5" /><path d="M12 17.4v.1" /></Icono>
}
