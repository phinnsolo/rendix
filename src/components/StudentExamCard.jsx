import { Link } from 'react-router-dom'
import { getSession } from '../auth.js'
import { HERRAMIENTAS } from '../config.js'
import { formatDuracion, getDuracion, getHerramientas, getTema } from '../examSettings.js'
import { formatDate } from '../formatDate.js'
import { isGraded } from '../submissionsStore.js'
import { estadoTurno, formatHorario, getApertura } from '../turnosStore.js'

// Tarjeta de un parcial del alumno: estado, turno, herramientas y el botón para abrirlo o ver la entrega.
// Con `claseId`, el parcial abierto vuelve a esa clase.
export default function StudentExamCard({ turno, doc, entrega, profesor, claseId }) {
  const tema = getTema(doc)
  const herramientas = getHerramientas(doc)
  const habilitadas = Object.entries(HERRAMIENTAS).filter(([key]) => herramientas[key])
  const abierto = !entrega && getApertura(turno, getSession().username) !== null
  const vencido = !entrega && estadoTurno(turno) === 'finalizado'
  const to = `/alumno/parciales/${doc.id}${claseId ? `?clase=${claseId}` : ''}`

  let chip
  if (entrega) {
    chip = isGraded(entrega)
      ? <span className="chip published">Nota: {entrega.correccion.nota}</span>
      : <span className="chip">Sin corregir</span>
  } else if (vencido) chip = <span className="chip incorrect">No entregado</span>
  else chip = <span className={abierto ? 'chip pending' : 'chip'}>{abierto ? 'Abierto' : 'Pendiente'}</span>

  return (
    <li className="card student-exam">
      <div className="student-exam-main">
        <Link to={to} className="doc-title">{doc.titulo}</Link>
        {chip}
      </div>
      <p className="exam-turno">{formatHorario(turno)}</p>
      <p className="muted small">
        {profesor?.nombre}{tema && ` · ${tema}`} · Duración: {formatDuracion(getDuracion(doc))}
        {entrega && ` · Entregado: ${formatDate(entrega.fechaEntrega)}`}
      </p>
      {!entrega && !vencido && (
        <div className="exam-tools">
          <span className="muted">Herramientas:</span>
          {habilitadas.length === 0
            ? <span className="muted">ninguna</span>
            : habilitadas.map(([key, label]) => <span key={key} className="chip">{label}</span>)}
        </div>
      )}
      <div className="actions">
        <Link to={to} className={entrega || vencido ? 'button secondary' : 'button'}>
          {entrega ? 'Ver entrega' : vencido ? 'Ver' : abierto ? 'Continuar' : 'Abrir'}
        </Link>
      </div>
    </li>
  )
}
