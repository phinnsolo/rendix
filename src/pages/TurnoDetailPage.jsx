import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAlumnos, nombreDe } from '../auth.js'
import { getClase } from '../clasesStore.js'
import { getDocument, isPublished } from '../documentsStore.js'
import { formatDate } from '../formatDate.js'
import { getSubmissionsFor } from '../submissionsStore.js'
import { asignarAlumnos, estadoTurno, formatHorario, getSeguimiento, getTurno, quitarAlumno } from '../turnosStore.js'
import { now } from '../clock.js'
import { formatRemaining } from '../components/ExamHeader.jsx'
import NotFound from '../components/NotFound.jsx'
import BackLink from '../components/BackLink.jsx'

const ESTADO_TURNO = {
  proximo: { label: 'Próximo', className: 'chip' },
  'en-curso': { label: 'En curso', className: 'chip pending' },
  finalizado: { label: 'Finalizado', className: 'chip published' },
}

const ESTADO_ALUMNO = {
  'no-abrio': { label: 'No abrió', className: 'chip' },
  'en-linea': { label: 'En línea', className: 'chip pending' },
  desconectado: { label: 'Desconectado', className: 'chip incorrect' },
  entregado: { label: 'Entregado', className: 'chip published' },
  'entregado-sistema': { label: 'Entregado por sistema', className: 'chip published' },
  'no-completo': { label: 'No completó', className: 'chip incorrect' },
}

const SEGUIMIENTO_MS = 2000
// Sin latido en este tiempo (el alumno late cada 5 s), se lo considera desconectado.
const DESCONECTADO_MS = 12_000

function estadoAlumno({ sesion, entrega }, estadoDelTurno, ahora) {
  if (entrega) return entrega.enviadoPorSistema ? 'entregado-sistema' : 'entregado'
  if (!sesion) return estadoDelTurno === 'finalizado' ? 'no-completo' : 'no-abrio'
  if (sesion.estado !== 'en-curso') return 'entregado-sistema'
  return ahora - Date.parse(sesion.ultimoLatido) > DESCONECTADO_MS ? 'desconectado' : 'en-linea'
}

function haceCuanto(iso, ahora) {
  const s = Math.max(0, Math.round((ahora - Date.parse(iso)) / 1000))
  if (s < 60) return `hace ${s} s`
  return `hace ${Math.floor(s / 60)} min`
}

// Un turno asignado a un parcial: alumnos asignados y seguimiento de quién abrió y quién envió el examen.
// El turno en sí (fecha y hora) se cambia desde Editar en el parcial.
export default function TurnoDetailPage() {
  const { id: parcialId, turnoId } = useParams()
  // El seguimiento se pide al servidor cada 2 s; entre pedidos, el tiempo restante corre con la hora del servidor.
  const [seguimiento, setSeguimiento] = useState(null)
  const [sinConexion, setSinConexion] = useState(false)
  const [ahora, setAhora] = useState(now)
  const refresh = useCallback(() => {
    getSeguimiento(turnoId).then(
      (datos) => {
        setSeguimiento(new Map(datos.alumnos.map((a) => [a.username, a])))
        setSinConexion(false)
      },
      () => setSinConexion(true)
    )
  }, [turnoId])
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, SEGUIMIENTO_MS)
    return () => clearInterval(timer)
  }, [refresh])
  useEffect(() => {
    const timer = setInterval(() => setAhora(now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const turno = getTurno(turnoId)
  if (!turno || turno.parcialId !== parcialId) {
    return <NotFound title="Turno no encontrado" backTo={`/documentos/${parcialId}`} backLabel="Volver al parcial" />
  }

  const doc = getDocument(turno.parcialId)
  const estado = estadoTurno(turno)
  const entregas = new Map(getSubmissionsFor(turno.parcialId).map((e) => [e.alumno, e]))

  const filas = turno.alumnos
    .map((username) => {
      const vivo = seguimiento?.get(username) ?? { sesion: null, entrega: entregas.get(username) ?? null }
      const { sesion, entrega } = vivo
      const enCurso = !entrega && sesion?.estado === 'en-curso'
      return {
        username,
        nombre: nombreDe(username),
        entrega,
        sesion,
        apertura: sesion?.apertura ?? entrega?.fechaInicio ?? null,
        restante: enCurso ? Math.max(0, Math.ceil((Date.parse(sesion.deadline) - ahora) / 1000)) : null,
        estado: estadoAlumno(vivo, estado, ahora),
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
  const total = filas.length
  const abrieron = filas.filter((f) => f.apertura || f.entrega).length
  const enviaron = filas.filter((f) => f.entrega).length

  async function handleQuitar(username) {
    if (!window.confirm(`¿Quitar a ${nombreDe(username)} del turno?`)) return
    try {
      await quitarAlumno(turno.id, username)
    } catch (e) {
      window.alert(`No se pudo quitar. ${e.message}`)
    }
    refresh()
  }

  return (
    <>
      <BackLink to={`/documentos/${parcialId}`}>Volver al parcial</BackLink>
      <h1>{doc?.titulo ?? 'Examen eliminado'}</h1>
      <p className="muted small chips-line">
        <span className={ESTADO_TURNO[estado].className}>{ESTADO_TURNO[estado].label}</span>
        {formatHorario(turno)}
      </p>
      {doc && !isPublished(doc) && (
        <div className="card notice">
          <span className="chip">Sin publicar</span> Los alumnos asignados no lo ven hasta que publiques el parcial.
        </div>
      )}

      {estado !== 'finalizado' && (
        <AsignarAlumnos turno={turno} clase={getClase(doc?.claseId)} onAsignados={refresh} />
      )}

      <section className="submissions">
        <div className="tracking-header">
          <h2>Alumnos asignados ({total})</h2>
          {total > 0 && (
            <p className="muted small">
              Abrieron <strong>{abrieron}</strong> de {total} · Enviaron <strong>{enviaron}</strong> de {total}
            </p>
          )}
          {sinConexion && <p className="error small" role="status">Sin conexión con el servidor: el seguimiento no se está actualizando.</p>}
        </div>
        {total === 0 ? (
          <p className="muted">Todavía no asignaste alumnos a este turno.</p>
        ) : (
          <div className="table-scroll">
            <table className="tracking-table">
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Estado</th>
                  <th>Tiempo restante</th>
                  <th>Sincronización</th>
                  <th>Apertura</th>
                  <th>Envío</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.username}>
                    <td>
                      {fila.nombre}
                      <span className="muted small table-sub">{fila.username}</span>
                    </td>
                    <td><span className={ESTADO_ALUMNO[fila.estado].className}>{ESTADO_ALUMNO[fila.estado].label}</span></td>
                    <td className={fila.restante !== null && fila.restante <= 60 ? 'num urgent' : 'num'}>
                      {fila.restante === null ? '—' : formatRemaining(fila.restante)}
                    </td>
                    <td><Sincronizacion fila={fila} ahora={ahora} /></td>
                    <td>{fila.apertura ? formatDate(fila.apertura) : '—'}</td>
                    <td>{fila.entrega ? formatDate(fila.entrega.fechaEntrega) : '—'}</td>
                    <td className="table-actions">
                      {fila.entrega && (
                        <Link to={`/documentos/${turno.parcialId}/entregas/${fila.entrega.id}`} className="button secondary">
                          Ver entrega
                        </Link>
                      )}
                      {estado === 'proximo' && (
                        <button type="button" className="danger" onClick={() => handleQuitar(fila.username)}>
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

// Si el alumno tiene cambios sin subir (problemas de red) o cuándo se guardó lo último.
function Sincronizacion({ fila, ahora }) {
  if (fila.entrega || !fila.sesion) return <span className="muted">—</span>
  if (fila.sesion.pendientes) return <span className="chip pending">Cambios pendientes</span>
  if (!fila.sesion.ultimoGuardado) return <span className="muted small">Sin cambios guardados</span>
  return <span className="muted small">Guardado {haceCuanto(fila.sesion.ultimoGuardado, ahora)}</span>
}

// Buscar alumnos y asignar uno o varios al turno: los de la clase del parcial o, si no tiene clase, todos
// los registrados. Si ya estaban en otro turno del parcial que no empezó, se los mueve a este.
function AsignarAlumnos({ turno, clase, onAsignados }) {
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState([])
  const [mensaje, setMensaje] = useState('')

  const texto = busqueda.trim().toLowerCase()
  const candidatos = clase ? getAlumnos().filter((a) => clase.alumnos.includes(a.username)) : getAlumnos()
  const disponibles = candidatos.filter(
    (a) =>
      !turno.alumnos.includes(a.username) &&
      (a.nombre.toLowerCase().includes(texto) ||
        a.username.toLowerCase().includes(texto) ||
        a.email?.toLowerCase().includes(texto))
  )

  function toggle(username) {
    setSeleccion((current) =>
      current.includes(username) ? current.filter((u) => u !== username) : [...current, username]
    )
  }

  async function handleAsignar() {
    try {
      const rechazados = await asignarAlumnos(turno.id, seleccion)
      setMensaje(
        rechazados.length === 0
          ? ''
          : `No se asignó a ${rechazados.map(nombreDe).join(', ')}: ya rinde este examen en otro turno que empezó.`
      )
    } catch (e) {
      setMensaje(`No se pudo asignar. ${e.message}`)
    }
    setSeleccion([])
    onAsignados()
  }

  return (
    <section className="card assign">
      <h2>Asignar alumnos</h2>
      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre, usuario o mail…"
        aria-label="Buscar alumnos"
      />
      {disponibles.length === 0 ? (
        <p className="muted small">
          {texto ? 'Ningún alumno sin asignar coincide con la búsqueda.' : 'Todos los alumnos ya están asignados.'}
        </p>
      ) : (
        <ul className="assign-list">
          {disponibles.map((a) => (
            <li key={a.username}>
              <label className="assign-option">
                <input type="checkbox" checked={seleccion.includes(a.username)} onChange={() => toggle(a.username)} />
                {a.nombre} <span className="muted small">{a.username}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {mensaje && <p className="error">{mensaje}</p>}
      <div className="actions">
        <button type="button" onClick={handleAsignar} disabled={seleccion.length === 0}>
          Asignar{seleccion.length > 0 && ` (${seleccion.length})`}
        </button>
        {disponibles.length > 0 && (
          <button
            type="button"
            className="secondary"
            onClick={() => setSeleccion(disponibles.map((a) => a.username))}
          >
            Seleccionar los {disponibles.length}
          </button>
        )}
      </div>
    </section>
  )
}
