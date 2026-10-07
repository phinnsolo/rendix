import { Link } from 'react-router-dom'
import { getSession } from '../auth.js'
import { getDocuments, isPublished } from '../documentsStore.js'

export default function DashboardPage() {
  const session = getSession()
  const documents = getDocuments()
  const publicados = documents.filter(isPublished).length
  const creados = documents.length - publicados

  return (
    <>
      <h1>Hola, {session?.nombre}</h1>
      <div className="card">
        <h2>Parciales</h2>
        <p className="muted">
          {creados === 1 ? '1 sin publicar' : `${creados} sin publicar`} ·{' '}
          {publicados === 1 ? '1 publicado.' : `${publicados} publicados.`}
        </p>
        <Link to="/documentos" className="button">Ir a parciales</Link>
      </div>
    </>
  )
}
