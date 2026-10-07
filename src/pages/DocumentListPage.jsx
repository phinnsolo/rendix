import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteDocument, getDocuments } from '../documentsStore.js'
import { formatDate } from '../formatDate.js'

export default function DocumentListPage() {
  const [documents, setDocuments] = useState(getDocuments)

  function handleDelete(doc) {
    if (window.confirm(`¿Eliminar "${doc.titulo}"?`)) {
      deleteDocument(doc.id)
      setDocuments(getDocuments())
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Documentos</h1>
        <Link to="/documentos/nuevo" className="button">Nuevo documento</Link>
      </div>

      {documents.length === 0 ? (
        <p className="muted">Todavía no hay documentos.</p>
      ) : (
        <ul className="doc-list">
          {documents.map((doc) => (
            <li key={doc.id} className="card">
              <div>
                <Link to={`/documentos/${doc.id}`} className="doc-title">{doc.titulo}</Link>
                <p className="muted small">
                  {doc.tema && `${doc.tema} · `}Modificado: {formatDate(doc.fechaModificacion)}
                </p>
              </div>
              <div className="actions">
                <Link to={`/documentos/${doc.id}/editar`} className="button secondary">Editar</Link>
                <button type="button" className="danger" onClick={() => handleDelete(doc)}>
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
