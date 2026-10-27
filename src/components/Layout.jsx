import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SESION_VENCIDA_EVENT } from '../api.js'
import { getRole, getSession, homePath, logout } from '../auth.js'
import { hayDatos, recargarDatos, useDatos } from '../datos.js'
import { getAllSubmissions, isGraded } from '../submissionsStore.js'
import icon from '../assets/rendix-icon.png'

export default function Layout() {
  const navigate = useNavigate()
  const session = getSession()
  const rol = getRole(session)
  const { pathname } = useLocation()
  // Re-renderiza todo cuando llegan datos nuevos del servidor.
  useDatos()
  const [error, setError] = useState('')
  const recargar = useCallback(() => {
    recargarDatos().then(() => setError(''), (e) => setError(e.message))
  }, [])

  // Se recargan al navegar, al volver a la pestaña y cada 30 s, para ver lo que cambió en otros dispositivos.
  useEffect(recargar, [pathname, recargar])
  useEffect(() => {
    const timer = setInterval(recargar, 30_000)
    window.addEventListener('focus', recargar)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', recargar)
    }
  }, [recargar])

  const handleLogout = useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [navigate])
  useEffect(() => {
    window.addEventListener(SESION_VENCIDA_EVENT, handleLogout)
    return () => window.removeEventListener(SESION_VENCIDA_EVENT, handleLogout)
  }, [handleLogout])

  const sinCorregir = rol !== 'profesor' ? 0 : getAllSubmissions().filter((e) => !isGraded(e)).length

  return (
    <>
      <header className="header">
        <Link to={homePath(session)} className="brand">
          <img src={icon} alt="" className="brand-icon" />
          Rendix
        </Link>
        <nav>
          {rol === 'dev' && <NavLink to="/dev">Clases</NavLink>}
          {rol === 'alumno' && (
            <>
              <NavLink to="/alumno" end>Mis clases</NavLink>
              <NavLink to="/alumno/parciales">Parciales</NavLink>
            </>
          )}
          {rol === 'profesor' && (
            <>
              <NavLink to="/documentos">Parciales</NavLink>
              <NavLink to="/entregas">
                Entregas{sinCorregir > 0 && <span className="nav-badge" aria-label={`${sinCorregir} sin corregir`}>{sinCorregir}</span>}
              </NavLink>
            </>
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
        {hayDatos() ? (
          <Outlet />
        ) : error ? (
          <div className="card notice" role="alert">
            <p>{error}</p>
            <button type="button" onClick={recargar}>Reintentar</button>
          </div>
        ) : (
          <p className="muted" role="status">Cargando…</p>
        )}
      </main>
    </>
  )
}
