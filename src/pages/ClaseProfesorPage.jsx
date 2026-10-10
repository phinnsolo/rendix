import { useReducer } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getSession } from '../auth.js'
import { formatDiaTurno, getClase } from '../clasesStore.js'
import { getDocumentsDeClase, isPublished, publishDocument } from '../documentsStore.js'
import { formatDate } from '../formatDate.js'
import { getSubmissionsFor, isGraded } from '../submissionsStore.js'
import { alumnosLabel, estadoTurno, formatHorario, getTurnosFor, proximoTurno } from '../turnosStore.js'
import NotFound from '../components/NotFound.jsx'
import SubmissionChips from '../components/SubmissionChips.jsx'
import TomarAhoraButton from '../components/TomarAhoraButton.jsx'

const TABS = { parciales: 'Parciales', entregas: 'Entregas' }

const ESTADO_PARCIAL = {
  borrador: { label: 'Sin publicar', className: 'chip' },
  'sin-turno': { label: 'Sin turno', className: 'chip' },
  proximo: { label: 'Próximo', className: 'chip' },
  'en-curso': { label: 'En curso', className: 'chip pending' },
  finalizado: { label: 'Finalizado', className: 'chip published' },
}

// Un parcial publicado está en curso si se está tomando en alguno de sus turnos; si no, próximo si le
// queda alguno por empezar, y finalizado si ya pasaron todos.
function estadoParcial(doc, turnos) {
  if (!isPublished(doc)) return 'borrador'
  const estados = turnos.map((t) => estadoTurno(t))
  if (estados.includes('en-curso')) return 'en-curso'
  if (estados.includes('proximo')) return 'proximo'
  return estados.length > 0 ? 'finalizado' : 'sin-turno'
}

// Una clase del profesor: sus parciales con el estado de cada uno y las entregas a corregir.
export default function ClaseProfesorPage() {
  const { id } = useParams()
  const [, refresh] = useReducer((n) => n + 1, 0)
  // La pestaña vive en la URL para que "Volver" y el refresh la conserven.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'entregas' ? 'entregas' : 'parciales'
  const clase = getClase(id)

  if (!clase || !clase.profesores.includes(getSession().username)) {
    return <NotFound title="Clase no encontrada" backTo="/" backLabel="Volver al inicio" />
  }

  const parciales = getDocumentsDeClase(clase.id).map((doc) => {
    const turnos = getTurnosFor(doc.id)
    const asignados = new Set(turnos.flatMap((t) => t.alumnos))
    return {
      doc,
      estado: estadoParcial(doc, turnos),
      proximo: proximoTurno(doc.id),
      enCurso: turnos.find((t) => estadoTurno(t) === 'en-curso') ?? null,
      asignados: asignados.size,
      entregas: getSubmissionsFor(doc.id).filter((e) => asignados.has(e.alumno)),
    }
  })
  const entregas = parciales
    .flatMap((p) => p.entregas)
    .sort((a, b) => b.fechaEntrega.localeCompare(a.fechaEntrega))
  const sinCorregir = entregas.filter((e) => !isGraded(e))
  const corregidas = entregas.filter(isGraded)

  function handlePublish(doc) {
    if (window.confirm(`¿Publicar "${doc.titulo}"? Los alumnos de la clase lo van a ver.`)) {
      publishDocument(doc.id)
      refresh()
    }
  }

  return (
    <>
      <p><Link to="/">← Volver al inicio</Link></p>
      <div className="page-header">
        <h1>{clase.nombre}</h1>
        <Link to={`/documentos/nuevo?clase=${clase.id}`} className="button">Nuevo parcial</Link>
      </div>
      <p className="muted small">{formatDiaTurno(clase)} · {alumnosLabel(clase.alumnos.length)}</p>

      <div className="tabs" role="tablist">
        {Object.entries(TABS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'tab active' : 'tab'}
            onClick={() => setSearchParams(key === 'parciales' ? {} : { tab: key }, { replace: true })}
          >
            {label} ({key === 'parciales' ? parciales.length : sinCorregir.length})
          </button>
        ))}
      </div>

      {tab === 'parciales' ? (
        parciales.length === 0 ? (
          <p className="muted">Todavía no hay parciales en esta clase.</p>
        ) : (
          <ul className="doc-list">
            {parciales.map(({ doc, estado, proximo, enCurso, asignados, entregas }) => (
              <li key={doc.id} className="card">
                <div>
                  <div className="chips-line">
                    <Link to={`/documentos/${doc.id}`} className="doc-title">{doc.titulo}</Link>{' '}
                    <span className={ESTADO_PARCIAL[estado].className}>{ESTADO_PARCIAL[estado].label}</span>
                  </div>
                  <p className="muted small">
                    {doc.tema && `${doc.tema} · `}
                    {enCurso
                      ? `En curso: ${formatHorario(enCurso)}`
                      : proximo ? `Próximo: ${formatHorario(proximo)}` : 'Sin turnos por venir'}
                  </p>
                  {isPublished(doc) && (
                    <p className="muted small">
                      {alumnosLabel(asignados)} · Enviaron {entregas.length} de {asignados}
                      {entregas.some((e) => !isGraded(e)) && ` · ${entregas.filter((e) => !isGraded(e)).length} sin corregir`}
                    </p>
                  )}
                </div>
                <div className="actions">
                  {!isPublished(doc) && (
                    <button
                      type="button"
                      onClick={() => handlePublish(doc)}
                      disabled={!proximo}
                      title={proximo ? undefined : 'Asignale un turno que todavía no haya empezado'}
                    >
                      Publicar
                    </button>
                  )}
                  <TomarAhoraButton doc={doc} onTomado={refresh} />
                  <Link to={`/documentos/${doc.id}`} className="button secondary">Ver</Link>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : entregas.length === 0 ? (
        <p className="muted">Todavía no hay entregas en esta clase.</p>
      ) : (
        <>
          <EntregasList titulo="Sin corregir" entregas={sinCorregir} clase={clase} vacio="No hay entregas sin corregir." />
          <EntregasList titulo="Corregidas" entregas={corregidas} clase={clase} vacio="Todavía no corregiste ninguna entrega." />
        </>
      )}
    </>
  )
}

function EntregasList({ titulo, entregas, clase, vacio }) {
  return (
    <section className="submissions">
      <h2>{titulo} ({entregas.length})</h2>
      {entregas.length === 0 ? (
        <p className="muted">{vacio}</p>
      ) : (
        <ul className="doc-list">
          {entregas.map((entrega) => {
            const to = `/documentos/${entrega.parcialId}/entregas/${entrega.id}?clase=${clase.id}`
            return (
              <li key={entrega.id} className="card">
                <div>
                  <Link to={to} className="doc-title">{entrega.alumnoNombre}</Link>
                  <p className="muted small chips-line">
                    {entrega.titulo} · Entregado: {formatDate(entrega.fechaEntrega)} <SubmissionChips entrega={entrega} />
                  </p>
                </div>
                <Link to={to} className={isGraded(entrega) ? 'button secondary' : 'button'}>
                  {isGraded(entrega) ? 'Ver corrección' : 'Corregir'}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
