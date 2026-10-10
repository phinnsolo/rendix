import { getSession } from '../auth.js'
import { getClasesDe } from '../clasesStore.js'
import ClasesGrid from '../components/ClaseCard.jsx'

// Inicio del alumno: las clases a las que está asignado.
export default function StudentHomePage() {
  const session = getSession()

  return (
    <>
      <h1>Mis clases</h1>
      <ClasesGrid clases={getClasesDe(session.username)} />
    </>
  )
}
