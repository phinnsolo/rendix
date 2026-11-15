import { useEffect, useState } from 'react'
import { ESTADO_ALUMNO_CORRECCION } from '../correccion.js'
import { formatDate } from '../formatDate.js'
import { getResultado } from '../submissionsStore.js'

const pts = (n) => (n == null ? '—' : String(n).replace('.', ','))

// Resultado del alumno (RF13). Antes de la publicación muestra solo el estado (Entregado / En corrección): ni notas
// preliminares ni devoluciones (el servidor tampoco las manda). Publicada, la nota final, el puntaje definitivo de cada
// pregunta y el feedback aprobado por el profesor, de solo lectura.
export default function ResultadoAlumno({ entrega }) {
  const publicada = entrega.estadoCorreccion === 'publicado'
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!publicada) return
    let vivo = true
    getResultado(entrega.id).then(
      (r) => vivo && setResultado(r.resultado),
      (e) => vivo && setError(e.sinConexion ? 'Sin conexión con el servidor. Volvé a intentar en un momento.' : e.message)
    )
    return () => { vivo = false }
  }, [entrega.id, publicada])

  if (!publicada) {
    const estado = ESTADO_ALUMNO_CORRECCION[entrega.estadoCorreccion] ?? ESTADO_ALUMNO_CORRECCION.entregado
    return (
      <div className="card grade-card pending">
        <div className="grade-card-header">
          <h2>Corrección</h2>
          <span className={estado.className}>{estado.label}</span>
        </div>
        <p className="muted">
          {entrega.estadoCorreccion === 'en-correccion'
            ? 'Tu parcial se está corrigiendo. Vas a ver la nota y la devolución cuando tu profesor las publique.'
            : 'Tu parcial se entregó correctamente. Vas a ver la nota y la devolución cuando tu profesor las publique.'}
        </p>
      </div>
    )
  }

  if (error) return <div className="card grade-card"><p className="error" role="alert">No se pudo cargar tu nota. {error}</p></div>
  if (!resultado) return <div className="card grade-card"><p className="muted" role="status">Cargando tu nota…</p></div>

  return (
    <section className="card grade-card resultado" aria-label="Resultado publicado">
      <div className="grade-card-header">
        <h2>Corrección</h2>
        <span className="chips-line">
          <span className="chip published">Nota publicada</span>
          {resultado.fechaPublicacion && <span className="muted small">el {formatDate(resultado.fechaPublicacion)}</span>}
        </span>
      </div>
      <p className="grade-value">
        <strong>{pts(resultado.nota)}</strong> <span className="muted">/ 10</span>
        {resultado.total != null && <span className="muted small">· {pts(resultado.total)} de {pts(resultado.maximo)} puntos</span>}
      </p>
      {resultado.devolucion && (
        <div className="grade-feedback">
          <span className="block-answer-label">Devolución del profesor</span>
          <div className="content">{resultado.devolucion}</div>
        </div>
      )}
      {resultado.preguntas.length > 0 && (
        <ol className="resultado-preguntas">
          {resultado.preguntas.map((p) => (
            <li key={p.bloqueId} className="resultado-pregunta">
              <div className="resultado-pregunta-head">
                <span className="content">{p.orden + 1}. {p.consigna}</span>
                <span className="resultado-puntos" aria-label={`${pts(p.puntaje)} de ${pts(p.puntajeMax)} puntos`}>
                  {pts(p.puntaje)}<span className="muted">/{pts(p.puntajeMax)}</span>
                </span>
              </div>
              {p.feedback && <p className="content resultado-feedback">{p.feedback}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
