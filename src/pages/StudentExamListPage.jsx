import { Link, useSearchParams } from 'react-router-dom'
import { getSession } from '../auth.js'
import { HERRAMIENTAS, PROFESORES } from '../config.js'
import { getPublishedDocumentOf } from '../documentsStore.js'
import { formatDuracion, getDuracion, getHerramientas, getTema } from '../examSettings.js'
import { formatDate } from '../formatDate.js'
import { getSubmissionOf, isGraded } from '../submissionsStore.js'
import { formatHorario, getApertura, getTurnosDeAlumno } from '../turnosStore.js'

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

function ExamCard({ turno, doc, entrega, profesor }) {
  const tema = getTema(doc)
  const herramientas = getHerramientas(doc)
  const habilitadas = Object.entries(HERRAMIENTAS).filter(([key]) => herramientas[key])
  const abierto = !entrega && getApertura(turno, getSession().username) !== null
  const to = `/alumno/parciales/${doc.id}`

  return (
    <li className="card student-exam">
      <div className="student-exam-main">
        <Link to={to} className="doc-title">{doc.titulo}</Link>
        {entrega
          ? isGraded(entrega)
            ? <span className="chip published">Nota: {entrega.correccion.nota}</span>
            : <span className="chip">Sin corregir</span>
          : <span className={abierto ? 'chip pending' : 'chip'}>{abierto ? 'Abierto' : 'Pendiente'}</span>}
      </div>
      <p className="exam-turno">{turno.nombre} · {formatHorario(turno)}</p>
      <p className="muted small">
        {profesor?.nombre}{tema && ` · ${tema}`} · Duración: {formatDuracion(getDuracion(doc))}
        {entrega && ` · Entregado: ${formatDate(entrega.fechaEntrega)}`}
      </p>
      {!entrega && (
        <div className="exam-tools">
          <span className="muted">Herramientas:</span>
          {habilitadas.length === 0
            ? <span className="muted">ninguna</span>
            : habilitadas.map(([key, label]) => <span key={key} className="chip">{label}</span>)}
        </div>
      )}
      <div className="actions">
        <Link to={to} className={entrega ? 'button secondary' : 'button'}>
          {entrega ? 'Ver entrega' : abierto ? 'Continuar' : 'Abrir'}
        </Link>
      </div>
    </li>
  )
}
