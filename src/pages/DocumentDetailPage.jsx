import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteDocument, getDocument, isPublished } from '../documentsStore.js'
import { formatDate } from '../formatDate.js'
import NotFound from '../components/NotFound.jsx'
import DocumentBlocksView from '../components/DocumentBlocksView.jsx'
import ExamHeader from '../components/ExamHeader.jsx'
import { getBlocks } from '../documentBlocks.js'
import { getHerramientas, getTema } from '../examSettings.js'

export default function DocumentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const doc = getDocument(id)

  if (!doc) return <NotFound />

  const publicado = isPublished(doc)
  const listPath = publicado ? '/documentos?tab=publicados' : '/documentos'

  function handleDelete() {
    if (window.confirm(`¿Eliminar "${doc.titulo}"?`)) {
      deleteDocument(doc.id)
      navigate(listPath)
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
      <p className="muted small">
        <span className={publicado ? 'chip published' : 'chip'}>{publicado ? 'Publicado' : 'Sin publicar'}</span>{' '}
        Creado: {formatDate(doc.fechaCreacion)} · Modificado: {formatDate(doc.fechaModificacion)}
        {publicado && ` · Publicado: ${formatDate(doc.fechaPublicacion)}`}
      </p>
      <ExamHeader tema={getTema(doc)} herramientas={getHerramientas(doc)} />
      <DocumentBlocksView blocks={getBlocks(doc)} />
    </>
  )
}
