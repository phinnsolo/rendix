import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteDocument, getDocument } from '../documentsStore.js'
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

  function handleDelete() {
    if (window.confirm(`¿Eliminar "${doc.titulo}"?`)) {
      deleteDocument(doc.id)
      navigate('/documentos')
    }
  }

  return (
    <>
      <p><Link to="/documentos">← Volver a documentos</Link></p>
      <div className="page-header">
        <h1>{doc.titulo}</h1>
        <div className="actions">
          <Link to={`/documentos/${doc.id}/editar`} className="button secondary">Editar</Link>
          <button type="button" className="danger" onClick={handleDelete}>Eliminar</button>
        </div>
      </div>
      <p className="muted small">
        Creado: {formatDate(doc.fechaCreacion)} · Modificado: {formatDate(doc.fechaModificacion)}
      </p>
      <ExamHeader tema={getTema(doc)} herramientas={getHerramientas(doc)} />
      <DocumentBlocksView blocks={getBlocks(doc)} />
    </>
  )
}
