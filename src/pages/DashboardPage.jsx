import { Link } from 'react-router-dom'
import { getSession } from '../auth.js'
import { getDocuments } from '../documentsStore.js'

export default function DashboardPage() {
  const session = getSession()
  const total = getDocuments().length

  return (
    <>
      <h1>Hola, {session?.nombre}</h1>
      <div className="card">
        <h2>Documentos</h2>
        <p className="muted">
          {total === 1 ? '1 documento guardado.' : `${total} documentos guardados.`}
        </p>
        <Link to="/documentos" className="button">Ir a documentos</Link>
      </div>
    </>
  )
}
