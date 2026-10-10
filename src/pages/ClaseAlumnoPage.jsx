import { Link, useParams } from 'react-router-dom'
import { getSession, nombreDe } from '../auth.js'
import { formatDiaTurno, getClase } from '../clasesStore.js'
import { getPublishedDocumentsDeClase } from '../documentsStore.js'
import { getSubmissionOf } from '../submissionsStore.js'
import { estadoTurno, getTurnosDeAlumno } from '../turnosStore.js'
import ExamCard from '../components/StudentExamCard.jsx'
import NotFound from '../components/NotFound.jsx'

// Una clase del alumno: los parciales que tiene para hacer ahora, los programados y los entregados.
// Los que terminaron sin entregar van con los entregados, marcados como no entregados.
export default function ClaseAlumnoPage() {
  const { id } = useParams()
  const session = getSession()
  const clase = getClase(id)

  if (!clase || !clase.alumnos.includes(session.username)) {
    return <NotFound title="Clase no encontrada" backTo="/alumno" backLabel="Volver a mis clases" />
  }

  const docs = new Map(getPublishedDocumentsDeClase(clase).map((doc) => [doc.id, doc]))
  const parciales = getTurnosDeAlumno(session.username)
    .filter((turno) => docs.has(turno.parcialId))
    .map((turno) => ({
      turno,
      doc: docs.get(turno.parcialId),
      entrega: getSubmissionOf(turno.profesor, turno.parcialId, session.username),
      estado: estadoTurno(turno),
    }))
  const secciones = [
    { titulo: 'Para hacer', items: parciales.filter((p) => !p.entrega && p.estado === 'en-curso') },
    { titulo: 'Programados', items: parciales.filter((p) => !p.entrega && p.estado === 'proximo') },
    {
      titulo: 'Entregados',
      // Los más recientes primero.
      items: parciales.filter((p) => p.entrega || p.estado === 'finalizado').reverse(),
    },
  ].filter((s) => s.items.length > 0)

  return (
    <>
      <p><Link to="/alumno">← Volver a mis clases</Link></p>
      <h1>{clase.nombre}</h1>
      <p className="muted small">
        {formatDiaTurno(clase)} · {clase.profesores.length === 1 ? 'Profesor' : 'Profesores'}:{' '}
        {clase.profesores.map(nombreDe).join(', ')}
      </p>

      {secciones.length === 0 ? (
        <p className="muted">Todavía no hay parciales en esta clase.</p>
      ) : (
        secciones.map(({ titulo, items }) => (
          <section key={titulo} className="submissions">
            <h2>{titulo} ({items.length})</h2>
            <ul className="doc-list">
              {items.map(({ turno, doc, entrega }) => (
                <ExamCard
                  key={turno.id}
                  turno={turno}
                  doc={doc}
                  entrega={entrega}
                  profesor={{ nombre: nombreDe(turno.profesor) }}
                  claseId={clase.id}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
