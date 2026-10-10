import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { homePath, isLoggedIn, registrarAlumno, validateRegistro } from '../auth.js'
import logo from '../assets/rendix-logo.png'

// Crear una cuenta de alumno. Después entra con el usuario o el mail, y la contraseña.
export default function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState({ nombre: '', usuario: '', email: '', password: '' })
  const [errores, setErrores] = useState({})
  const [error, setError] = useState('')

  if (isLoggedIn()) {
    return <Navigate to={homePath()} replace />
  }

  function set(campo) {
    return (event) => setValues((current) => ({ ...current, [campo]: event.target.value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const nuevos = validateRegistro(values)
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return
    try {
      const session = registrarAlumno(values)
      navigate(homePath(session), { replace: true })
    } catch {
      setError('No se pudo crear la cuenta: el almacenamiento del navegador está lleno.')
    }
  }

  const invalid = (campo) => (errores[campo] ? { 'aria-invalid': true } : {})

  return (
    <main className="login">
      <form className="form card" onSubmit={handleSubmit} noValidate>
        <div className="login-header">
          <h1><img src={logo} alt="Rendix" className="login-logo" /></h1>
          <p className="muted">Crear cuenta de alumno</p>
        </div>
        <label>
          Nombre
          <input value={values.nombre} onChange={set('nombre')} autoComplete="name" autoFocus {...invalid('nombre')} />
          {errores.nombre && <span className="field-error">{errores.nombre}</span>}
        </label>
        <label>
          Usuario
          <input value={values.usuario} onChange={set('usuario')} autoComplete="username" {...invalid('usuario')} />
          {errores.usuario
            ? <span className="field-error">{errores.usuario}</span>
            : <span className="muted hint">Con tu usuario o tu mail vas a poder iniciar sesión.</span>}
        </label>
        <label>
          Mail
          <input type="email" value={values.email} onChange={set('email')} autoComplete="email" {...invalid('email')} />
          {errores.email && <span className="field-error">{errores.email}</span>}
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={values.password}
            onChange={set('password')}
            autoComplete="new-password"
            {...invalid('password')}
          />
          {errores.password && <span className="field-error">{errores.password}</span>}
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Crear cuenta</button>
        <p className="muted small login-switch">
          ¿Ya tenés cuenta? <Link to="/login">Iniciar sesión</Link>
        </p>
      </form>
    </main>
  )
}
