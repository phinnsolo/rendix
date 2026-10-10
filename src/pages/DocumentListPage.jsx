import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { nombreClase } from '../clasesStore.js'
import { deleteDocument, getDocuments, isPublished, publishDocument } from '../documentsStore.js'
import { formatDate } from '../formatDate.js'
import { entregasLabel, getSubmissionsFor } from '../submissionsStore.js'
import { avisoBorrado } from '../deleteNotice.js'
import TomarAhoraButton from '../components/TomarAhoraButton.jsx'
import { formatHorario, proximoTurno } from '../turnosStore.js'

const TABS = {
  creados: { label: 'Creados', vacio: 'No hay parciales sin publicar.' },
  publicados: { label: 'Publicados', vacio: 'Todavía no publicaste ningún parcial.' },
}

export default function DocumentListPage() {
  const [documents, setDocuments] = useState(getDocuments)
  // La pestaña vive en la URL para que "Volver a parciales" y el refresh la conserven.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'publicados' ? 'publicados' : 'creados'
  const visibles = documents.filter((doc) => isPublished(doc) === (tab === 'publicados'))

  function handleDelete(doc) {
    if (window.confirm(`¿Eliminar "${doc.titulo}"?${avisoBorrado(doc.id)}`)) {
      deleteDocument(doc.id)
      setDocuments(getDocuments())
    }
  }

  function handlePublish(doc) {
    if (window.confirm(`¿Publicar "${doc.titulo}"? Los alumnos de la clase lo van a ver.`)) {
      publishDocument(doc.id)
      setDocuments(getDocuments())
    }
  }

  return (
    <>
      <p><Link to="/">← Volver al inicio</Link></p>
      <div className="page-header">
        <h1>Parciales</h1>
        <Link to="/documentos/nuevo" className="button">Nuevo parcial</Link>
      </div>

      <div className="tabs" role="tablist">
        {Object.entries(TABS).map(([key, { label }]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'tab active' : 'tab'}
            onClick={() => setSearchParams(key === 'creados' ? {} : { tab: key }, { replace: true })}
          >
            {label} ({documents.filter((doc) => isPublished(doc) === (key === 'publicados')).length})
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="muted">{TABS[tab].vacio}</p>
      ) : (
        <ul className="doc-list">
          {visibles.map((doc) => {
            const proximo = proximoTurno(doc.id)
            return (
              <li key={doc.id} className="card">
                <div>
                  <Link to={`/documentos/${doc.id}`} className="doc-title">{doc.titulo}</Link>
                  <p className="muted small">
                    {nombreClase(doc.claseId)} · {doc.tema && `${doc.tema} · `}
                    {isPublished(doc)
                      ? `Publicado: ${formatDate(doc.fechaPublicacion)} · ${entregasLabel(getSubmissionsFor(doc.id).length)}`
                      : `Modificado: ${formatDate(doc.fechaModificacion)}`}
                  </p>
                  <p className="muted small">{proximo ? `Próximo: ${formatHorario(proximo)}` : 'Sin turnos por venir'}</p>
                </div>
                <div className="actions">
                  {!isPublished(doc) && (
                    <button
                      type="button"
                      onClick={() => handlePublish(doc)}
                      disabled={!proximo}
                      title={proximo ? undefined : 'Asignale un turno que todavía no haya empezado'}
                    >
                      Publicar
                    </button>
                  )}
                  <TomarAhoraButton doc={doc} onTomado={() => setDocuments(getDocuments())} />
                  <Link to={`/documentos/${doc.id}/editar`} className="button secondary">Editar</Link>
                  <button type="button" className="danger" onClick={() => handleDelete(doc)}>
                    Eliminar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
