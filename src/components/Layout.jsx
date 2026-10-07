import { Link, Outlet, useNavigate } from 'react-router-dom'
import { getRole, getSession, homePath, logout } from '../auth.js'

export default function Layout() {
  const navigate = useNavigate()
  const session = getSession()
  const esAlumno = getRole(session) === 'alumno'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <header className="header">
        <Link to={homePath(session)} className="brand">Rendix</Link>
        <nav>
          <Link to={esAlumno ? '/alumno' : '/documentos'}>Parciales</Link>
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
