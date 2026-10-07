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
import { entregasLabel, getSubmissionsFor } from '../submissionsStore.js'

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

  function handleDelete() {
    const aviso = entregas.length > 0 ? ` También se borran sus ${entregasLabel(entregas.length)}.` : ''
    if (window.confirm(`¿Eliminar "${doc.titulo}"?${aviso}`)) {
      deleteDocument(doc.id)
      navigate(listPath)
    }
  }

  function handlePublish() {
    if (window.confirm(`¿Publicar "${doc.titulo}"? Los alumnos van a poder verlo.`)) {
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
          <span className="chip published">Publicado</span> Tus alumnos ya pueden ver y resolver este parcial.
        </div>
      )}
      <p className="muted small">
        <span className={publicado ? 'chip published' : 'chip'}>{publicado ? 'Publicado' : 'Sin publicar'}</span>{' '}
        Creado: {formatDate(doc.fechaCreacion)} · Modificado: {formatDate(doc.fechaModificacion)}
        {publicado && ` · Publicado: ${formatDate(doc.fechaPublicacion)}`}
      </p>

      {publicado && (
        <section className="submissions">
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
            <p className="muted small">Al publicarlo, tus alumnos van a poder verlo y resolverlo.</p>
          </div>
          <button type="button" onClick={handlePublish}>Publicar parcial</button>
        </div>
      )}
    </>
  )
}
