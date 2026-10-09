import { useEffect, useReducer } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getRole, getSession, homePath, logout } from '../auth.js'
import { CORRECCION_EVENT, getAllSubmissions, isGraded } from '../submissionsStore.js'
import icon from '../assets/rendix-icon.png'

export default function Layout() {
  const navigate = useNavigate()
  const session = getSession()
  const esAlumno = getRole(session) === 'alumno'
  // useNavigate re-renderiza el Layout en cada navegación; al corregir sin navegar, avisa CORRECCION_EVENT.
  const [, refresh] = useReducer((n) => n + 1, 0)
  useEffect(() => {
    window.addEventListener(CORRECCION_EVENT, refresh)
    return () => window.removeEventListener(CORRECCION_EVENT, refresh)
  }, [])
  const sinCorregir = esAlumno ? 0 : getAllSubmissions().filter((e) => !isGraded(e)).length

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <header className="header">
        <Link to={homePath(session)} className="brand">
          <img src={icon} alt="" className="brand-icon" />
          Rendix
        </Link>
        <nav>
          <NavLink to={esAlumno ? '/alumno' : '/documentos'}>Parciales</NavLink>
          {!esAlumno && <NavLink to="/turnos">Turnos</NavLink>}
          {!esAlumno && (
            <NavLink to="/entregas">
              Entregas{sinCorregir > 0 && <span className="nav-badge" aria-label={`${sinCorregir} sin corregir`}>{sinCorregir}</span>}
            </NavLink>
          )}
        </nav>
        <div className="header-user">
          <span>{session?.nombre}</span>
          <button type="button" className="secondary" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  )
}
