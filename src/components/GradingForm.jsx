import { useState } from 'react'
import { formatDate } from '../formatDate.js'
import { gradeSubmission } from '../submissionsStore.js'

function isValidNota(nota) {
  return Number.isFinite(nota) && nota >= 0 && nota <= 10
}

// Corrección de una entrega: nota de 0 a 10 y devolución opcional. Se puede volver a editar.
export default function GradingForm({ entrega, onGraded }) {
  const [nota, setNota] = useState(entrega.correccion ? String(entrega.correccion.nota) : '')
  const [comentario, setComentario] = useState(entrega.correccion?.comentario ?? '')
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()
    const valor = Number(nota.replace(',', '.'))
    if (!nota.trim() || !isValidNota(valor)) {
      setError('La nota tiene que ser un número entre 0 y 10.')
      return
    }
    onGraded(gradeSubmission(entrega.id, { nota: valor, comentario: comentario.trim() }))
    setError('')
    setGuardado(true)
  }

  return (
    <form className="card form grading" onSubmit={handleSubmit} noValidate>
      <div className="grading-header">
        <h2>Corrección</h2>
        {entrega.correccion && (
          <span className="muted small">Corregida el {formatDate(entrega.correccion.fecha)}</span>
        )}
      </div>
      <label>
        Nota (0 a 10)
        <input
          className="grade-input"
          inputMode="decimal"
          value={nota}
          onChange={(e) => { setNota(e.target.value); setGuardado(false) }}
          placeholder="Ej: 7.5"
        />
      </label>
      <label>
        <span>Devolución <span className="muted">(opcional)</span></span>
        <textarea
          rows={4}
          value={comentario}
          onChange={(e) => { setComentario(e.target.value); setGuardado(false) }}
          placeholder="Comentarios para el alumno…"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions grading-actions">
        <button type="submit">{entrega.correccion ? 'Guardar cambios' : 'Guardar corrección'}</button>
        {guardado && <span className="muted small">Corrección guardada.</span>}
      </div>
    </form>
  )
}
