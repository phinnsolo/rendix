import { Link, useSearchParams } from 'react-router-dom'
import { getDocument, isPublished } from '../documentsStore.js'
import { getSubmissionsFor } from '../submissionsStore.js'
import { alumnosLabel, estadoTurno, formatHorario, getTurnos } from '../turnosStore.js'

const TABS = {
  proximo: { label: 'Próximos', vacio: 'No hay parciales publicados por tomarse.' },
  'en-curso': { label: 'En curso', vacio: 'No se está tomando ningún parcial ahora.' },
  finalizado: { label: 'Finalizados', vacio: 'Todavía no terminó ningún parcial.' },
}

// Parciales publicados según su turno: los que vienen, los que se están tomando ahora y los terminados.
// Los turnos se asignan desde cada parcial; acá solo se consultan.
export default function TurnoListPage() {
  const turnos = getTurnos()
    .map((turno) => ({ turno, doc: getDocument(turno.parcialId) }))
    .filter(({ doc }) => isPublished(doc))
  // La pestaña vive en la URL para que "Volver" y el refresh la conserven.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS[searchParams.get('tab')] ? searchParams.get('tab') : 'proximo'
  const deTab = (key) => turnos.filter(({ turno }) => estadoTurno(turno) === key)
  // Los finalizados, del más reciente al más viejo.
  const visibles = tab === 'finalizado' ? deTab(tab).reverse() : deTab(tab)

  return (
    <>
      <h1>Turnos</h1>

      <div className="tabs" role="tablist">
        {Object.entries(TABS).map(([key, { label }]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'tab active' : 'tab'}
            onClick={() => setSearchParams(key === 'proximo' ? {} : { tab: key }, { replace: true })}
          >
            {label} ({deTab(key).length})
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="muted">{TABS[tab].vacio}</p>
      ) : (
        <ul className="doc-list">
          {visibles.map(({ turno, doc }) => {
            const asignados = new Set(turno.alumnos)
            const enviaron = getSubmissionsFor(doc.id).filter((e) => asignados.has(e.alumno)).length
            const seguimiento = `/documentos/${doc.id}/turnos/${turno.id}`
            return (
              <li key={turno.id} className="card">
                <div>
                  <Link to={`/documentos/${doc.id}`} className="doc-title">{doc.titulo}</Link>
                  <p className="muted small">
                    {formatHorario(turno)} · {alumnosLabel(turno.alumnos.length)}
                    {tab !== 'proximo' && ` · Enviaron ${enviaron} de ${turno.alumnos.length}`}
                  </p>
                </div>
                <Link to={seguimiento} className="button secondary">
                  {tab === 'proximo' ? 'Alumnos' : 'Seguimiento'}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
