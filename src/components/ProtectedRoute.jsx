import { Navigate } from 'react-router-dom'
import { getRole, getSession, homePath } from '../auth.js'

// Sin sesión manda al login; con otro rol, a la pantalla de inicio de ese rol.
export default function ProtectedRoute({ role, children }) {
  const session = getSession()
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (role && getRole(session) !== role) {
    return <Navigate to={homePath(session)} replace />
  }
  return children
}
