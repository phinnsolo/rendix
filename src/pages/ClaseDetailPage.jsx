import { Link, useParams } from 'react-router-dom'
import { nombreDe } from '../auth.js'
import { formatDiaTurno, getClase, isPredefinida } from '../clasesStore.js'
import NotFound from '../components/NotFound.jsx'

function Integrantes({ titulo, usernames }) {
  const ordenados = [...usernames].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es', { numeric: true }))
  return (
    <section className="clase-integrantes">
      <h2>{titulo} ({usernames.length})</h2>
      <ul className="assign-list">
        {ordenados.map((username) => (
          <li key={username} className="assign-option">
            {nombreDe(username)} <span className="muted small">{username}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Detalle de una clase para el dev: día, turno, profesores y alumnos.
export default function ClaseDetailPage() {
  const { id } = useParams()
  const clase = getClase(id)

  if (!clase) return <NotFound title="Clase no encontrada" backTo="/dev" backLabel="Volver a clases" />

  return (
    <>
      <p><Link to="/dev">← Volver a clases</Link></p>
      <div className="page-header">
        <h1>{clase.nombre}</h1>
        <Link to={`/dev/clases/${clase.id}/editar`} className="button secondary">Editar</Link>
      </div>
      <p className="muted small chips-line">
        {isPredefinida(clase) && <span className="chip">Predefinida</span>}
        {formatDiaTurno(clase)}
      </p>
      <Integrantes titulo="Profesores" usernames={clase.profesores} />
      <Integrantes titulo="Alumnos" usernames={clase.alumnos} />
    </>
  )
}
