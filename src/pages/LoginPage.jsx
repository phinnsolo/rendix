import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { homePath, isLoggedIn, login } from '../auth.js'
import logo from '../assets/rendix-logo.png'

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
        <div className="login-header">
          <h1><img src={logo} alt="Rendix" className="login-logo" /></h1>
          <p className="muted">Iniciar sesión</p>
        </div>
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
