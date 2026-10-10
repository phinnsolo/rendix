import { useReducer, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getClase } from '../clasesStore.js'
import { deleteDocument, getDocument, isPublished, publishDocument } from '../documentsStore.js'
import { formatDate } from '../formatDate.js'
import NotFound from '../components/NotFound.jsx'
import DocumentBlocksView from '../components/DocumentBlocksView.jsx'
import ExamHeader from '../components/ExamHeader.jsx'
import SubmissionChips from '../components/SubmissionChips.jsx'
import TomarAhoraButton from '../components/TomarAhoraButton.jsx'
import { getBlocks } from '../documentBlocks.js'
import { getDuracion, getHerramientas, getTema } from '../examSettings.js'
import { getSubmissionsFor } from '../submissionsStore.js'
import { alumnosLabel, estadoTurno, formatHorario, getTurnosFor } from '../turnosStore.js'
import { avisoBorrado } from '../deleteNotice.js'

export default function DocumentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Al publicar, el parcial se vuelve a leer del almacenamiento.
  const [, refresh] = useReducer((n) => n + 1, 0)
  const [recienPublicado, setRecienPublicado] = useState(false)
  const doc = getDocument(id)

  if (!doc) return <NotFound />

  const publicado = isPublished(doc)
  const clase = getClase(doc.claseId)
  const back = clase
    ? { to: `/clases/${clase.id}`, label: `Volver a ${clase.nombre}` }
    : { to: publicado ? '/documentos?tab=publicados' : '/documentos', label: 'Volver a parciales' }
  const entregas = getSubmissionsFor(doc.id)
  const turnos = getTurnosFor(doc.id)
  // Publicar solo tiene sentido si queda algún turno por empezar.
  const hayTurnoFuturo = turnos.some((t) => estadoTurno(t) === 'proximo')

  function handleDelete() {
    if (window.confirm(`¿Eliminar "${doc.titulo}"?${avisoBorrado(doc.id)}`)) {
      deleteDocument(doc.id)
      navigate(back.to)
    }
  }

  function handleTomado() {
    setRecienPublicado(true)
    refresh()
    window.scrollTo(0, 0)
  }

  function handlePublish() {
    if (window.confirm(`¿Publicar "${doc.titulo}"? Los alumnos de la clase lo van a ver.`)) {
      publishDocument(doc.id)
      setRecienPublicado(true)
      refresh()
      window.scrollTo(0, 0)
    }
  }

  return (
    <>
      <p><Link to={back.to}>← {back.label}</Link></p>
      <div className="page-header">
        <h1>{doc.titulo}</h1>
        <div className="actions">
          <Link to={`/documentos/${doc.id}/editar`} className="button secondary">Editar</Link>
          <TomarAhoraButton doc={doc} onTomado={handleTomado} />
          <button type="button" className="danger" onClick={handleDelete}>Eliminar</button>
        </div>
      </div>
      {recienPublicado && (
        <div className="card notice">
          <span className="chip published">Publicado</span> Los alumnos de la clase ya lo pueden ver.
        </div>
      )}
      <p className="muted small">
        <span className={publicado ? 'chip published' : 'chip'}>{publicado ? 'Publicado' : 'Sin publicar'}</span>{' '}
        {clase ? <Link to={`/clases/${clase.id}`}>{clase.nombre}</Link> : 'Sin clase'} ·{' '}
        Creado: {formatDate(doc.fechaCreacion)} · Modificado: {formatDate(doc.fechaModificacion)}
        {publicado && ` · Publicado: ${formatDate(doc.fechaPublicacion)}`}
      </p>

      <section className="submissions">
        <h2>Turnos ({turnos.length})</h2>
        {turnos.length === 0 ? (
          <p className="muted">
            Todavía no tiene turno asignado. <Link to={`/documentos/${doc.id}/editar`}>Asignar un turno</Link>
          </p>
        ) : (
          <ul className="doc-list">
            {turnos.map((turno) => (
              <li key={turno.id} className="card">
                <div>
                  <Link to={`/documentos/${doc.id}/turnos/${turno.id}`} className="doc-title">{formatHorario(turno)}</Link>
                  <p className="muted small">{alumnosLabel(turno.alumnos.length)}</p>
                </div>
                <Link to={`/documentos/${doc.id}/turnos/${turno.id}`} className="button secondary">
                  Alumnos y seguimiento
                </Link>
              </li>
            ))}
          </ul>
        )}
        {publicado && (
          <>
            <h2>Entregas ({entregas.length})</h2>
            {entregas.length === 0 ? (
              <p className="muted">Todavía no hay entregas.</p>
            ) : (
              <ul className="doc-list">
                {entregas.map((entrega) => (
                  <li key={entrega.id} className="card">
                    <div>
                      <Link to={`/documentos/${doc.id}/entregas/${entrega.id}`} className="doc-title">
                        {entrega.alumnoNombre}
                      </Link>
                      <p className="muted small chips-line">
                        Entregado: {formatDate(entrega.fechaEntrega)} <SubmissionChips entrega={entrega} />
                      </p>
                    </div>
                    <Link to={`/documentos/${doc.id}/entregas/${entrega.id}`} className="button secondary">
                      Ver entrega
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <h2>Parcial</h2>
      </section>

      <ExamHeader tema={getTema(doc)} herramientas={getHerramientas(doc)} duracion={getDuracion(doc)} />
      <DocumentBlocksView blocks={getBlocks(doc)} />

      {!publicado && (
        <div className="card publish-bar">
          <div>
            <strong>¿Está listo?</strong>
            <p className="muted small">
              {hayTurnoFuturo
                ? 'Los alumnos de la clase lo van a ver a partir de que lo publiques.'
                : 'Para publicarlo, asignale un turno que todavía no haya empezado.'}
            </p>
          </div>
          <div className="actions">
            <TomarAhoraButton doc={doc} onTomado={handleTomado} />
            <button type="button" onClick={handlePublish} disabled={!hayTurnoFuturo}>Publicar parcial</button>
          </div>
        </div>
      )}
    </>
  )
}
