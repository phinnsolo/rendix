import { useReducer, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteDocument, getDocument, isPublished, publishDocument } from '../documentsStore.js'
import { formatDate } from '../formatDate.js'
import NotFound from '../components/NotFound.jsx'
import DocumentBlocksView from '../components/DocumentBlocksView.jsx'
import ExamHeader from '../components/ExamHeader.jsx'
import SubmissionChips from '../components/SubmissionChips.jsx'
import { getBlocks } from '../documentBlocks.js'
import { getDuracion, getHerramientas, getTema } from '../examSettings.js'
import { getSubmissionsFor } from '../submissionsStore.js'
import { alumnosLabel, formatHorario, getTurnosFor } from '../turnosStore.js'
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
  const listPath = publicado ? '/documentos?tab=publicados' : '/documentos'
  const entregas = getSubmissionsFor(doc.id)
  const turnos = getTurnosFor(doc.id)

  function handleDelete() {
    if (window.confirm(`¿Eliminar "${doc.titulo}"?${avisoBorrado(doc.id)}`)) {
      deleteDocument(doc.id)
      navigate(listPath)
    }
  }

  function handlePublish() {
    if (window.confirm(`¿Publicar "${doc.titulo}"? Después vas a poder crear turnos para que lo rindan.`)) {
      publishDocument(doc.id)
      setRecienPublicado(true)
      refresh()
      window.scrollTo(0, 0)
    }
  }

  return (
    <>
      <p><Link to={listPath}>← Volver a parciales</Link></p>
      <div className="page-header">
        <h1>{doc.titulo}</h1>
        <div className="actions">
          <Link to={`/documentos/${doc.id}/editar`} className="button secondary">Editar</Link>
          <button type="button" className="danger" onClick={handleDelete}>Eliminar</button>
        </div>
      </div>
      {recienPublicado && (
        <div className="card notice">
          <span className="chip published">Publicado</span> Creá un turno y asigná alumnos para que lo puedan rendir.{' '}
          <Link to={`/turnos/nuevo?parcial=${doc.id}`}>Crear turno</Link>
        </div>
      )}
      <p className="muted small">
        <span className={publicado ? 'chip published' : 'chip'}>{publicado ? 'Publicado' : 'Sin publicar'}</span>{' '}
        Creado: {formatDate(doc.fechaCreacion)} · Modificado: {formatDate(doc.fechaModificacion)}
        {publicado && ` · Publicado: ${formatDate(doc.fechaPublicacion)}`}
      </p>

      {publicado && (
        <section className="submissions">
          <div className="tracking-header">
            <h2>Turnos ({turnos.length})</h2>
            <Link to={`/turnos/nuevo?parcial=${doc.id}`} className="button secondary">Crear turno</Link>
          </div>
          {turnos.length === 0 ? (
            <p className="muted">Todavía no hay turnos: los alumnos no lo pueden rendir hasta que los asignes a uno.</p>
          ) : (
            <ul className="doc-list">
              {turnos.map((turno) => (
                <li key={turno.id} className="card">
                  <div>
                    <Link to={`/turnos/${turno.id}`} className="doc-title">{turno.nombre}</Link>
                    <p className="muted small">{formatHorario(turno)} · {alumnosLabel(turno.alumnos.length)}</p>
                  </div>
                  <Link to={`/turnos/${turno.id}`} className="button secondary">Ver turno</Link>
                </li>
              ))}
            </ul>
          )}
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
          <h2>Parcial</h2>
        </section>
      )}

      <ExamHeader tema={getTema(doc)} herramientas={getHerramientas(doc)} duracion={getDuracion(doc)} />
      <DocumentBlocksView blocks={getBlocks(doc)} />

      {!publicado && (
        <div className="card publish-bar">
          <div>
            <strong>¿Está listo?</strong>
            <p className="muted small">Al publicarlo vas a poder crear turnos y asignarles alumnos.</p>
          </div>
          <button type="button" onClick={handlePublish}>Publicar parcial</button>
        </div>
      )}
    </>
  )
}
