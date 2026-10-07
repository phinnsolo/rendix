import { Link, useSearchParams } from 'react-router-dom'
import { formatDate } from '../formatDate.js'
import { getAllSubmissions, isGraded } from '../submissionsStore.js'
import SubmissionChips from '../components/SubmissionChips.jsx'

const TABS = {
  pendientes: { label: 'Sin corregir', vacio: 'No hay entregas sin corregir.' },
  corregidas: { label: 'Corregidas', vacio: 'Todavía no corregiste ninguna entrega.' },
}

// Todas las entregas de los parciales del profesor, separadas por estado de corrección.
export default function SubmissionsPage() {
  const entregas = getAllSubmissions()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'corregidas' ? 'corregidas' : 'pendientes'
  const deTab = (key) => entregas.filter((e) => isGraded(e) === (key === 'corregidas'))
  const visibles = deTab(tab)

  return (
    <>
      <h1>Entregas</h1>
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
            {label} ({deTab(key).length})
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="muted">{TABS[tab].vacio}</p>
      ) : (
        <ul className="doc-list">
          {visibles.map((entrega) => {
            const to = `/documentos/${entrega.parcialId}/entregas/${entrega.id}?from=entregas`
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
    </>
  )
}
