import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { homePath, isLoggedIn, login } from '../auth.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  if (isLoggedIn()) {
    return <Navigate to={homePath()} replace />
  }

  function handleSubmit(event) {
    event.preventDefault()
    const session = login(username.trim(), password)
    if (session) {
      navigate(homePath(session), { replace: true })
    } else {
      setError('Usuario o contraseña incorrectos.')
    }
  }

  return (
    <main className="login">
      <form className="form card" onSubmit={handleSubmit}>
        <h1>Rendix</h1>
        <p className="muted">Iniciar sesión</p>
        <label>
          Usuario
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Ingresar</button>
      </form>
    </main>
  )
}
