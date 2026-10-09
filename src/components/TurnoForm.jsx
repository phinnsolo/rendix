import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getDocuments, isPublished } from '../documentsStore.js'
import { validateTurno } from '../turnosStore.js'

function Field({ label, error, children }) {
  return (
    <label>
      {label}
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

// Crear o editar un turno. Solo se pueden elegir exámenes publicados.
export default function TurnoForm({ turnoId = null, initialValues, onSubmit, submitLabel, cancelTo }) {
  const [values, setValues] = useState({
    nombre: initialValues?.nombre ?? '',
    parcialId: initialValues?.parcialId ?? '',
    fecha: initialValues?.fecha ?? '',
    horaInicio: initialValues?.horaInicio ?? '',
    horaFin: initialValues?.horaFin ?? '',
  })
  const [errores, setErrores] = useState({})
  const [error, setError] = useState('')
  const publicados = getDocuments().filter(isPublished)

  function set(campo) {
    return (event) => setValues((current) => ({ ...current, [campo]: event.target.value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const nuevos = validateTurno(values, turnoId)
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return
    try {
      onSubmit(values)
    } catch (e) {
      setError(e.message.startsWith('El turno') ? e.message : 'No se pudo guardar: el almacenamiento del navegador está lleno.')
    }
  }

  const invalid = (campo) => (errores[campo] ? { 'aria-invalid': true } : {})

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <Field label="Nombre" error={errores.nombre}>
        <input value={values.nombre} onChange={set('nombre')} placeholder="Ej. Turno mañana" autoFocus {...invalid('nombre')} />
      </Field>
      <Field label="Examen" error={errores.parcialId}>
        <select value={values.parcialId} onChange={set('parcialId')} {...invalid('parcialId')}>
          <option value="">Elegí un examen publicado…</option>
          {publicados.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.titulo}{doc.tema && ` (${doc.tema})`}
            </option>
          ))}
        </select>
        {publicados.length === 0 && (
          <span className="hint muted">Todavía no publicaste ningún examen. <Link to="/documentos">Ir a parciales</Link></span>
        )}
      </Field>
      <div className="form-row">
        <Field label="Fecha" error={errores.fecha}>
          <input type="date" value={values.fecha} onChange={set('fecha')} {...invalid('fecha')} />
        </Field>
        <Field label="Hora de inicio" error={errores.horaInicio}>
          <input type="time" value={values.horaInicio} onChange={set('horaInicio')} {...invalid('horaInicio')} />
        </Field>
        <Field label="Hora de fin" error={errores.horaFin}>
          <input type="time" value={values.horaFin} onChange={set('horaFin')} {...invalid('horaFin')} />
        </Field>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit">{submitLabel}</button>
        <Link to={cancelTo} className="button secondary">Cancelar</Link>
      </div>
    </form>
  )
}
