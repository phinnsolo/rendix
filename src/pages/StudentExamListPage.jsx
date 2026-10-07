import { getSession } from '../auth.js'
import { HERRAMIENTAS, PROFESORES } from '../config.js'
import { getPublishedDocumentsOf } from '../documentsStore.js'
import { getHerramientas, getTema } from '../examSettings.js'
import { formatDate } from '../formatDate.js'

// Lista de parciales publicados por el profesor del alumno.
// Las cards no tienen acción: rendir el parcial todavía no está implementado.
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
            return (
              <li key={doc.id} className="card student-exam">
                <div className="student-exam-main">
                  <span className="doc-title">{doc.titulo}</span>
                  <span className="chip published">Publicado</span>
                </div>
                <p className="muted small">
                  {profesor.nombre}{tema && ` · ${tema}`} · Publicado: {formatDate(doc.fechaPublicacion)}
                </p>
                <div className="exam-tools">
                  <span className="muted">Herramientas:</span>
                  {habilitadas.length === 0
                    ? <span className="muted">ninguna</span>
                    : habilitadas.map(([key, label]) => <span key={key} className="chip">{label}</span>)}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
