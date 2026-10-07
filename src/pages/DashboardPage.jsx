import { Link } from 'react-router-dom'
import { getSession } from '../auth.js'
import { getDocuments, isPublished } from '../documentsStore.js'
import { getAllSubmissions, isGraded } from '../submissionsStore.js'

export default function DashboardPage() {
  const session = getSession()
  const documents = getDocuments()
  const publicados = documents.filter(isPublished).length
  const creados = documents.length - publicados
  const sinCorregir = getAllSubmissions().filter((e) => !isGraded(e)).length

  return (
    <>
      <h1>Hola, {session?.nombre}</h1>
      <div className="dashboard">
        <div className="card">
          <h2>Parciales</h2>
          <p className="muted">
            {creados === 1 ? '1 sin publicar' : `${creados} sin publicar`} ·{' '}
            {publicados === 1 ? '1 publicado.' : `${publicados} publicados.`}
          </p>
          <Link to="/documentos" className="button">Ir a parciales</Link>
        </div>
        <div className="card">
          <h2>Entregas</h2>
          <p className="muted">
            {sinCorregir === 1 ? '1 entrega sin corregir.' : `${sinCorregir} entregas sin corregir.`}
          </p>
          <Link to="/entregas" className="button">Ir a entregas</Link>
        </div>
      </div>
    </>
  )
}
