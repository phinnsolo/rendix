import { Link } from 'react-router-dom'
import { getClases } from '../clasesStore.js'
import ClasesGrid from '../components/ClaseCard.jsx'

// Inicio del dev: todas las clases.
export default function ClaseListPage() {
  return (
    <>
      <div className="page-header">
        <h1>Clases</h1>
        <Link to="/dev/clases/nueva" className="button">Nueva clase</Link>
      </div>
      <ClasesGrid
        clases={getClases()}
        linkTo={(clase) => `/dev/clases/${clase.id}`}
        vacio="Todavía no hay clases."
      />
    </>
  )
}
