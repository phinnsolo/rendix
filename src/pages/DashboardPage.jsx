import { Link } from 'react-router-dom'
import { getSession } from '../auth.js'
import { getDocuments, isPublished } from '../documentsStore.js'
import { getAllSubmissions, isGraded } from '../submissionsStore.js'
import { estadoTurno, getTurnos } from '../turnosStore.js'

export default function DashboardPage() {
  const session = getSession()
  const documents = getDocuments()
  const publicados = documents.filter(isPublished).length
  const creados = documents.length - publicados
  const sinCorregir = getAllSubmissions().filter((e) => !isGraded(e)).length
  const turnos = getTurnos()
  const proximos = turnos.filter((t) => estadoTurno(t) === 'proximo').length
  const enCurso = turnos.filter((t) => estadoTurno(t) === 'en-curso').length

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
          <h2>Turnos</h2>
          <p className="muted">
            {enCurso === 1 ? '1 en curso' : `${enCurso} en curso`} ·{' '}
            {proximos === 1 ? '1 próximo.' : `${proximos} próximos.`}
          </p>
          <Link to="/turnos" className="button">Ir a turnos</Link>
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
