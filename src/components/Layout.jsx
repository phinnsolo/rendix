import { Link, Outlet, useNavigate } from 'react-router-dom'
import { getSession, logout } from '../auth.js'

export default function Layout() {
  const navigate = useNavigate()
  const session = getSession()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <header className="header">
        <Link to="/" className="brand">Rendix</Link>
        <nav>
          <Link to="/documentos">Documentos</Link>
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
