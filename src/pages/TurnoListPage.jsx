import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getDocument } from '../documentsStore.js'
import { alumnosLabel, deleteTurno, estadoTurno, formatHorario, getTurnos } from '../turnosStore.js'

const TABS = {
  proximo: { label: 'Próximos', vacio: 'No hay turnos próximos.' },
  'en-curso': { label: 'En curso', vacio: 'No hay turnos en curso.' },
  finalizado: { label: 'Finalizados', vacio: 'Todavía no terminó ningún turno.' },
}

export default function TurnoListPage() {
  const [turnos, setTurnos] = useState(getTurnos)
  // La pestaña vive en la URL para que "Volver a turnos" y el refresh la conserven.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS[searchParams.get('tab')] ? searchParams.get('tab') : 'proximo'
  const deTab = (key) => turnos.filter((t) => estadoTurno(t) === key)
  // Los finalizados, del más reciente al más viejo.
  const visibles = tab === 'finalizado' ? deTab(tab).reverse() : deTab(tab)

  function handleDelete(turno) {
    if (window.confirm(`¿Eliminar el turno "${turno.nombre}"?`)) {
      deleteTurno(turno.id)
      setTurnos(getTurnos())
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Turnos</h1>
        <Link to="/turnos/nuevo" className="button">Nuevo turno</Link>
      </div>

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
          {visibles.map((turno) => (
            <li key={turno.id} className="card">
              <div>
                <Link to={`/turnos/${turno.id}`} className="doc-title">{turno.nombre}</Link>
                <p className="muted small">
                  {getDocument(turno.parcialId)?.titulo ?? 'Examen eliminado'} · {formatHorario(turno)} ·{' '}
                  {alumnosLabel(turno.alumnos.length)}
                </p>
              </div>
              <div className="actions">
                {tab === 'proximo' ? (
                  <>
                    <Link to={`/turnos/${turno.id}/editar`} className="button secondary">Editar</Link>
                    <button type="button" className="danger" onClick={() => handleDelete(turno)}>Eliminar</button>
                  </>
                ) : (
                  <Link to={`/turnos/${turno.id}`} className="button secondary">Seguimiento</Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
