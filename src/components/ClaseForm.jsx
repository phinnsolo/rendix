import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAlumnos } from '../auth.js'
import { DIAS, PROFESORES, TURNOS } from '../config.js'
import { validateClase } from '../clasesStore.js'

function toggle(lista, username) {
  return lista.includes(username) ? lista.filter((u) => u !== username) : [...lista, username]
}

// Crear una clase: nombre, día y turno fijos, y los profesores y alumnos asignados.
export default function ClaseForm({ onSubmit, submitLabel, cancelTo }) {
  const [values, setValues] = useState({ nombre: '', dia: '', turno: '', profesores: [], alumnos: [] })
  const [busqueda, setBusqueda] = useState('')
  const [errores, setErrores] = useState({})
  const [error, setError] = useState('')

  const texto = busqueda.trim().toLowerCase()
  const alumnos = getAlumnos().filter(
    (a) =>
      a.nombre.toLowerCase().includes(texto) ||
      a.username.toLowerCase().includes(texto) ||
      a.email?.toLowerCase().includes(texto)
  )
  const sinElegir = alumnos.filter((a) => !values.alumnos.includes(a.username))

  function set(campo, valor) {
    setValues((current) => ({ ...current, [campo]: valor }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const nuevos = validateClase(values)
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return
    try {
      onSubmit(values)
    } catch {
      setError('No se pudo guardar: el almacenamiento del navegador está lleno.')
    }
  }

  const invalid = (campo) => (errores[campo] ? { 'aria-invalid': true } : {})

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <label>
        Nombre
        <input
          value={values.nombre}
          onChange={(e) => set('nombre', e.target.value)}
          placeholder="Ej. Matemáticas"
          autoFocus
          {...invalid('nombre')}
        />
        {errores.nombre && <span className="field-error">{errores.nombre}</span>}
      </label>
      <div className="form-row">
        <label>
          Día
          <select value={values.dia} onChange={(e) => set('dia', e.target.value)} {...invalid('dia')}>
            <option value="" disabled>Elegí un día</option>
            {Object.entries(DIAS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          {errores.dia && <span className="field-error">{errores.dia}</span>}
        </label>
        <label>
          Turno
          <select value={values.turno} onChange={(e) => set('turno', e.target.value)} {...invalid('turno')}>
            <option value="" disabled>Elegí un turno</option>
            {Object.entries(TURNOS).map(([key, t]) => (
              <option key={key} value={key}>{t.nombre} ({t.inicio} a {t.fin})</option>
            ))}
          </select>
          {errores.turno && <span className="field-error">{errores.turno}</span>}
        </label>
      </div>

      <fieldset className="tools-selector">
        <legend>Profesores ({values.profesores.length})</legend>
        <ul className="assign-list">
          {PROFESORES.map((p) => (
            <li key={p.username}>
              <label className="assign-option">
                <input
                  type="checkbox"
                  checked={values.profesores.includes(p.username)}
                  onChange={() => set('profesores', toggle(values.profesores, p.username))}
                />
                {p.nombre} <span className="muted small">{p.username}</span>
              </label>
            </li>
          ))}
        </ul>
        {errores.profesores && <span className="field-error">{errores.profesores}</span>}
      </fieldset>

      <fieldset className="tools-selector clase-alumnos">
        <legend>Alumnos ({values.alumnos.length})</legend>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, usuario o mail…"
          aria-label="Buscar alumnos"
        />
        {alumnos.length === 0 ? (
          <p className="muted small">Ningún alumno coincide con la búsqueda.</p>
        ) : (
          <ul className="assign-list">
            {alumnos.map((a) => (
              <li key={a.username}>
                <label className="assign-option">
                  <input
                    type="checkbox"
                    checked={values.alumnos.includes(a.username)}
                    onChange={() => set('alumnos', toggle(values.alumnos, a.username))}
                  />
                  {a.nombre} <span className="muted small">{a.username}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {sinElegir.length > 0 && (
          <button
            type="button"
            className="secondary"
            onClick={() => set('alumnos', [...values.alumnos, ...sinElegir.map((a) => a.username)])}
          >
            Seleccionar los {sinElegir.length}
          </button>
        )}
        {errores.alumnos && <span className="field-error">{errores.alumnos}</span>}
      </fieldset>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit">{submitLabel}</button>
        <Link to={cancelTo} className="button secondary">Cancelar</Link>
      </div>
    </form>
  )
}
