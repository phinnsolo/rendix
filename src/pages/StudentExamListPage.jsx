import { Link } from 'react-router-dom'
import { getSession } from '../auth.js'
import { HERRAMIENTAS, PROFESORES } from '../config.js'
import { getPublishedDocumentsOf } from '../documentsStore.js'
import { formatDuracion, getDuracion, getHerramientas, getTema } from '../examSettings.js'
import { formatDate } from '../formatDate.js'
import { getExamStart, getSubmissionOf } from '../submissionsStore.js'

// Lista de parciales publicados por el profesor del alumno, con el estado de su entrega.
export default function StudentExamListPage() {
  const session = getSession()
  const profesor = PROFESORES.find((p) => p.username === session?.profesor)
  const parciales = profesor ? getPublishedDocumentsOf(profesor.username) : []

  return (
    <>
      <h1>Parciales</h1>
      {parciales.length === 0 ? (
        <p className="muted">Tu profesor todavía no publicó parciales.</p>
      ) : (
        <ul className="doc-list">
          {parciales.map((doc) => {
            const tema = getTema(doc)
            const herramientas = getHerramientas(doc)
            const habilitadas = Object.entries(HERRAMIENTAS).filter(([key]) => herramientas[key])
            const entrega = getSubmissionOf(profesor.username, doc.id, session.username)
            const enCurso = !entrega && getExamStart(doc.id) !== null
            return (
              <li key={doc.id} className="card student-exam">
                <div className="student-exam-main">
                  <Link to={`/alumno/parciales/${doc.id}`} className="doc-title">{doc.titulo}</Link>
                  {entrega
                    ? <span className="chip published">Entregado: {formatDate(entrega.fechaEntrega)}</span>
                    : <span className="chip pending">{enCurso ? 'En curso' : 'Pendiente'}</span>}
                </div>
                <p className="muted small">
                  {profesor.nombre}{tema && ` · ${tema}`} · Duración: {formatDuracion(getDuracion(doc))} · Publicado: {formatDate(doc.fechaPublicacion)}
                </p>
                <div className="exam-tools">
                  <span className="muted">Herramientas:</span>
                  {habilitadas.length === 0
                    ? <span className="muted">ninguna</span>
                    : habilitadas.map(([key, label]) => <span key={key} className="chip">{label}</span>)}
                </div>
                <div className="actions">
                  <Link to={`/alumno/parciales/${doc.id}`} className={entrega ? 'button secondary' : 'button'}>
                    {entrega ? 'Ver entrega' : enCurso ? 'Continuar' : 'Resolver'}
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
