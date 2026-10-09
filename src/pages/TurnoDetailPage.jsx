import { useEffect, useReducer, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ALUMNOS } from '../config.js'
import { getDocument } from '../documentsStore.js'
import { formatDate } from '../formatDate.js'
import { getSubmissionsFor } from '../submissionsStore.js'
import {
  asignarAlumnos,
  deleteTurno,
  estadoTurno,
  formatHorario,
  getApertura,
  getTurno,
  quitarAlumno,
} from '../turnosStore.js'
import NotFound from '../components/NotFound.jsx'

const ESTADO_TURNO = {
  proximo: { label: 'Próximo', className: 'chip' },
  'en-curso': { label: 'En curso', className: 'chip pending' },
  finalizado: { label: 'Finalizado', className: 'chip published' },
}

const ESTADO_ALUMNO = {
  'no-abrio': { label: 'No abrió', className: 'chip' },
  abierto: { label: 'Abierto', className: 'chip pending' },
  enviado: { label: 'Enviado', className: 'chip published' },
  'no-completo': { label: 'No completó', className: 'chip incorrect' },
}

function nombreDe(username) {
  return ALUMNOS.find((a) => a.username === username)?.nombre ?? username
}

// Datos del turno, alumnos asignados y seguimiento de quién abrió y quién envió el examen.
export default function TurnoDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  // El seguimiento se vuelve a leer cada pocos segundos y cuando otra pestaña cambia el almacenamiento.
  const [, refresh] = useReducer((n) => n + 1, 0)
  useEffect(() => {
    const timer = setInterval(refresh, 3000)
    window.addEventListener('storage', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const turno = getTurno(id)
  if (!turno) return <NotFound title="Turno no encontrado" backTo="/turnos" backLabel="Volver a turnos" />

  const doc = getDocument(turno.parcialId)
  const estado = estadoTurno(turno)
  const listPath = estado === 'proximo' ? '/turnos' : `/turnos?tab=${estado}`
  const entregas = new Map(getSubmissionsFor(turno.parcialId).map((e) => [e.alumno, e]))

  const filas = turno.alumnos
    .map((username) => {
      const entrega = entregas.get(username) ?? null
      const apertura = getApertura(turno, username) ?? entrega?.fechaInicio ?? null
      let estadoAlumno = 'no-abrio'
      if (entrega) estadoAlumno = 'enviado'
      else if (apertura) estadoAlumno = estado === 'finalizado' ? 'no-completo' : 'abierto'
      return { username, nombre: nombreDe(username), entrega, apertura, estado: estadoAlumno }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
  const total = filas.length
  const abrieron = filas.filter((f) => f.apertura || f.entrega).length
  const enviaron = filas.filter((f) => f.entrega).length

  function handleDelete() {
    if (window.confirm(`¿Eliminar el turno "${turno.nombre}"?`)) {
      deleteTurno(turno.id)
      navigate('/turnos')
    }
  }

  function handleQuitar(username) {
    if (window.confirm(`¿Quitar a ${nombreDe(username)} del turno?`)) {
      quitarAlumno(turno.id, username)
      refresh()
    }
  }

  return (
    <>
      <p><Link to={listPath}>← Volver a turnos</Link></p>
      <div className="page-header">
        <h1>{turno.nombre}</h1>
        {estado === 'proximo' && (
          <div className="actions">
            <Link to={`/turnos/${turno.id}/editar`} className="button secondary">Editar</Link>
            <button type="button" className="danger" onClick={handleDelete}>Eliminar</button>
          </div>
        )}
      </div>
      <p className="muted small chips-line">
        <span className={ESTADO_TURNO[estado].className}>{ESTADO_TURNO[estado].label}</span>
        {formatHorario(turno)} · Examen:{' '}
        {doc ? <Link to={`/documentos/${doc.id}`}>{doc.titulo}</Link> : 'eliminado'}
      </p>

      {estado !== 'finalizado' && (
        <AsignarAlumnos turno={turno} onAsignados={refresh} />
      )}

      <section className="submissions">
        <div className="tracking-header">
          <h2>Alumnos asignados ({total})</h2>
          {total > 0 && (
            <p className="muted small">
              Abrieron <strong>{abrieron}</strong> de {total} · Enviaron <strong>{enviaron}</strong> de {total}
            </p>
          )}
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

// Buscar alumnos registrados y asignar uno o varios al turno.
function AsignarAlumnos({ turno, onAsignados }) {
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState([])
  const [mensaje, setMensaje] = useState('')

  const texto = busqueda.trim().toLowerCase()
  const disponibles = ALUMNOS.filter(
    (a) =>
      !turno.alumnos.includes(a.username) &&
      (a.nombre.toLowerCase().includes(texto) || a.username.toLowerCase().includes(texto))
  )

  function toggle(username) {
    setSeleccion((current) =>
      current.includes(username) ? current.filter((u) => u !== username) : [...current, username]
    )
  }

  function handleAsignar() {
    try {
      const rechazados = asignarAlumnos(turno.id, seleccion)
      setMensaje(
        rechazados.length === 0
          ? ''
          : `No se asignó a ${rechazados.map(nombreDe).join(', ')}: ya rinde este examen en otro turno.`
      )
    } catch (e) {
      setMensaje(e.message.startsWith('El turno') ? e.message : 'No se pudo guardar: el almacenamiento del navegador está lleno.')
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
        placeholder="Buscar por nombre o usuario…"
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
