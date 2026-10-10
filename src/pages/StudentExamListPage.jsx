import { useSearchParams } from 'react-router-dom'
import { getSession } from '../auth.js'
import { PROFESORES } from '../config.js'
import { getPublishedDocumentOf } from '../documentsStore.js'
import { getSubmissionOf } from '../submissionsStore.js'
import { getTurnosDeAlumno } from '../turnosStore.js'
import ExamCard from '../components/StudentExamCard.jsx'

const TABS = {
  pendientes: { label: 'A entregar', vacio: 'No tenés parciales para entregar.' },
  entregados: { label: 'Entregados', vacio: 'Todavía no entregaste ningún parcial.' },
}

// Parciales publicados de los turnos del alumno, separados entre los que tiene que entregar y los entregados.
export default function StudentExamListPage() {
  const session = getSession()
  // La pestaña vive en la URL para que "Volver a parciales" y el refresh la conserven.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'entregados' ? 'entregados' : 'pendientes'

  const parciales = getTurnosDeAlumno(session.username)
    .map((turno) => ({ turno, doc: getPublishedDocumentOf(turno.profesor, turno.parcialId) }))
    .filter(({ doc }) => doc)
    .map(({ turno, doc }) => ({
      turno,
      doc,
      entrega: getSubmissionOf(turno.profesor, doc.id, session.username),
      profesor: PROFESORES.find((p) => p.username === turno.profesor),
    }))
  const porTab = {
    pendientes: parciales.filter((p) => !p.entrega),
    entregados: parciales
      .filter((p) => p.entrega)
      .sort((a, b) => b.entrega.fechaEntrega.localeCompare(a.entrega.fechaEntrega)),
  }
  const visibles = porTab[tab]

  return (
    <>
      <h1>Parciales</h1>
      <div className="tabs" role="tablist">
        {Object.entries(TABS).map(([key, { label }]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'tab active' : 'tab'}
            onClick={() => setSearchParams(key === 'pendientes' ? {} : { tab: key }, { replace: true })}
          >
            {label} ({porTab[key].length})
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="muted">{parciales.length === 0 ? 'Todavía no tenés parciales asignados.' : TABS[tab].vacio}</p>
      ) : (
        <ul className="doc-list">
          {visibles.map(({ turno, doc, entrega, profesor }) => (
            <ExamCard key={turno.id} turno={turno} doc={doc} entrega={entrega} profesor={profesor} />
          ))}
        </ul>
      )}
    </>
  )
}
