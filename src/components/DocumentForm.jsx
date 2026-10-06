import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function DocumentForm({ initialValues, onSubmit, submitLabel, cancelTo }) {
  const [titulo, setTitulo] = useState(initialValues?.titulo ?? '')
  const [contenido, setContenido] = useState(initialValues?.contenido ?? '')
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    if (!titulo.trim()) {
      setError('El título es obligatorio.')
      return
    }
    onSubmit({ titulo: titulo.trim(), contenido })
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label>
        Título
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
      </label>
      <label>
        Contenido
        <textarea rows={12} value={contenido} onChange={(e) => setContenido(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit">{submitLabel}</button>
        <Link to={cancelTo} className="button secondary">Cancelar</Link>
      </div>
    </form>
  )
}
