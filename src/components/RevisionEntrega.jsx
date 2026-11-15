import { useState } from 'react'
import { BLOCK_TYPES, CODE_LANGUAGES, getBlocks } from '../documentBlocks.js'
import { ESTADO_CORRECCION, ESTADO_EVALUACION, FEEDBACK_MAXIMO, calcularNota, pendientesDePublicar } from '../correccion.js'
import { formatDate } from '../formatDate.js'
import { nombreDe } from '../auth.js'
import { ajustarEvaluacion, getRevision, publicarEntrega, reevaluarEntrega } from '../submissionsStore.js'
import { usePolling } from '../usePolling.js'
import BlockAnswer from './BlockAnswer.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import ExamBlocks from './ExamBlocks.jsx'
import GradingForm from './GradingForm.jsx'
import { CampoNumero } from './CorreccionBloque.jsx'
import { LineaDeTiempo } from './AlumnoActividad.jsx'

const ACTUALIZACION_MS = 3000
const NIVEL = {
  1: { icono: '✓', clase: 'cumple', texto: 'Cumple' },
  0.5: { icono: '◐', clase: 'parcial', texto: 'Parcial' },
  0: { icono: '✗', clase: 'no-cumple', texto: 'No cumple' },
}
const pts = (n) => (n == null ? '—' : String(n).replace('.', ','))
const pct = (n) => `${Math.round(n * 100)} %`

// Revisión docente de una entrega (RF12): la evaluación de cada agente juez junto a la respuesta original, alertas,
// ajuste de puntaje y feedback, incidentes del modo restringido, historial de cambios y publicación.
export default function RevisionEntrega({ entregaInicial }) {
  const [datos, setDatos] = useState(null) // { entrega, evaluaciones, auditoria, eventos }
  const [error, setError] = useState('')
  const enCola = datos?.evaluaciones.some((ev) => ev.estado === 'pendiente' || ev.estado === 'procesando') ?? true

  // Mientras algún juez está corrigiendo se actualiza sola; después, al hacer cambios.
  async function refrescar() {
    try {
      setDatos(await getRevision(entregaInicial.id))
      setError('')
    } catch (e) {
      setError(e.sinConexion ? 'Sin conexión con el servidor: la revisión puede estar desactualizada.' : e.message)
    }
  }
  usePolling(refrescar, ACTUALIZACION_MS, { clave: entregaInicial.id, activo: enCola })

  if (!datos) {
    return error ? <p className="error" role="alert">{error}</p> : <p className="muted" role="status">Cargando la corrección…</p>
  }

  const { entrega, evaluaciones, auditoria, eventos } = datos
  const publicada = entrega.estadoCorreccion === 'publicado'
  const actualizarEvaluacion = ({ evaluacion, entrega: nueva }) => setDatos((d) => ({
    ...d, entrega: nueva, evaluaciones: d.evaluaciones.map((ev) => (ev.id === evaluacion.id ? evaluacion : ev)),
  }))

  return (
    <>
      {error && <p className="error small" role="status">{error}</p>}
      <ResumenCorreccion entrega={entrega} evaluaciones={evaluaciones} onCambio={refrescar} />
      {evaluaciones.length === 0 ? (
        <SinCorreccionPorPregunta entrega={entrega} onCambio={refrescar} />
      ) : (
        <div className="blocks">
          {getBlocks({ id: entrega.id, bloques: entrega.bloques }).map((block, index) => {
            const ev = evaluaciones.find((x) => x.bloqueId === block.id)
            return (
              <PreguntaRevision key={block.id} block={block} index={index} respuesta={entrega.respuestas?.[block.id]}
                evaluacion={ev} entregaId={entrega.id} bloqueada={publicada} onGuardado={(r) => { actualizarEvaluacion(r); refrescar() }} />
            )
          })}
        </div>
      )}
      <Incidentes eventos={eventos} />
      <Historial auditoria={auditoria} evaluaciones={evaluaciones} />
    </>
  )
}

// Encabezado: estado, nota recalculada, progreso de los jueces, alertas y publicación individual.
function ResumenCorreccion({ entrega, evaluaciones, onCambio }) {
  const [confirmar, setConfirmar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [errorPublicar, setErrorPublicar] = useState('')
  const estado = ESTADO_CORRECCION[entrega.estadoCorreccion] ?? ESTADO_CORRECCION.entregado
  const publicada = entrega.estadoCorreccion === 'publicado'
  const items = evaluaciones.map((ev) => ({ ...ev, puntajeMax: ev.puntajeMax, puntajeFinal: ev.puntajeFinal }))
  const { total, maximo, nota } = calcularNota(items)
  const notaVisible = evaluaciones.length > 0 ? nota : entrega.correccion?.nota ?? null
  const pendientes = pendientesDePublicar(items)
  const corregidas = evaluaciones.filter((ev) => !['pendiente', 'procesando'].includes(ev.estado)).length
  const r = entrega.resumenCorreccion
  const lista = evaluaciones.length > 0 ? pendientes.length === 0 : entrega.correccion?.nota != null
  const errores = evaluaciones.filter((ev) => ev.estado === 'error')

  async function publicar() {
    setOcupado(true)
    setErrorPublicar('')
    try {
      const { yaPublicada } = await publicarEntrega(entrega.id)
      setMensaje(yaPublicada ? 'La nota ya estaba publicada.' : 'Nota publicada: el alumno ya la puede ver.')
      setConfirmar(false)
      onCambio()
    } catch (e) {
      setErrorPublicar(e.sinConexion ? 'Sin conexión con el servidor. Probá de nuevo.' : e.message)
    } finally {
      setOcupado(false)
    }
  }

  async function reintentar() {
    setOcupado(true)
    try {
      await reevaluarEntrega(entrega.id)
      setMensaje('Las preguntas con error volvieron a la cola de los jueces.')
      onCambio()
    } catch (e) {
      setMensaje(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="card revision-resumen" aria-label="Resumen de la corrección">
      <div className="revision-resumen-main">
        <div>
          <div className="chips-line">
            <span className={estado.className}>{estado.label}</span>
            {publicada && entrega.fechaPublicacion && <span className="muted small">Publicada el {formatDate(entrega.fechaPublicacion)}</span>}
          </div>
          {evaluaciones.length > 0 && (
            <>
              <p className="muted small">
                Corregidas {corregidas} de {evaluaciones.length} preguntas · Puntaje {pts(total)} / {pts(maximo)}
              </p>
              <span className="monitor-bar revision-bar" aria-hidden="true">
                <span style={{ width: `${(corregidas / evaluaciones.length) * 100}%` }} />
              </span>
            </>
          )}
          <AlertasChips resumen={r} />
          {r?.errorCola && <p className="error small">La corrección automática está en espera: {r.errorCola}</p>}
        </div>
        <p className="grade-value revision-nota" aria-label="Nota">
          <strong>{notaVisible == null ? '—' : pts(notaVisible)}</strong> <span className="muted">/ 10</span>
        </p>
      </div>
      {mensaje && <p className="notice small" role="status">{mensaje}</p>}
      {!publicada && (
        <div className="actions revision-acciones">
          <button type="button" onClick={() => { setErrorPublicar(''); setConfirmar(true) }} disabled={!lista || ocupado}>
            Publicar nota
          </button>
          {errores.length > 0 && (
            <button type="button" className="secondary" onClick={reintentar} disabled={ocupado}>
              Reintentar con IA ({errores.length})
            </button>
          )}
          {!lista && evaluaciones.length > 0 && (
            <span className="muted small">
              Para publicar falta puntaje en: {pendientes.map((p) => `pregunta ${p.orden + 1}`).join(', ')}.
            </span>
          )}
        </div>
      )}
      <ConfirmDialog
        abierto={confirmar}
        titulo={`¿Publicar la nota de ${entrega.alumnoNombre}?`}
        confirmar={ocupado ? 'Publicando…' : 'Publicar'}
        ocupado={ocupado}
        onConfirmar={publicar}
        onCancelar={() => setConfirmar(false)}
      >
        <p>
          Nota final: <strong>{notaVisible == null ? '—' : pts(notaVisible)} / 10</strong>. El alumno va a ver la nota, el puntaje de
          cada pregunta y el feedback. Después de publicarla ya no se puede modificar.
        </p>
        {errorPublicar && <p className="error">{errorPublicar}</p>}
      </ConfirmDialog>
    </section>
  )
}

export function AlertasChips({ resumen }) {
  if (!resumen) return null
  return (
    <p className="chips-line revision-alertas">
      {resumen.enCola > 0 && <span className="chip pending">⏳ {resumen.enCola} en corrección</span>}
      {resumen.errores > 0 && <span className="chip incorrect">⚠ {resumen.errores} con error del juez</span>}
      {resumen.manuales > 0 && <span className="chip incorrect">✎ {resumen.manuales} para corregir a mano</span>}
      {resumen.bajaConfianza > 0 && <span className="chip pending">◔ {resumen.bajaConfianza} con baja confianza</span>}
      {resumen.vacias > 0 && <span className="chip">∅ {resumen.vacias} sin respuesta</span>}
    </p>
  )
}

// Una pregunta: consigna, respuesta original, evaluación del juez y el formulario de ajuste docente.
function PreguntaRevision({ block, index, respuesta, evaluacion: ev, entregaId, bloqueada, onGuardado }) {
  const [puntaje, setPuntaje] = useState(ev?.puntajeFinal ?? Number.NaN)
  const [feedback, setFeedback] = useState(ev?.feedbackFinal ?? '')
  const [clave, setClave] = useState(0) // reinicia el campo numérico al cambiar el valor desde el servidor
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [ultimo, setUltimo] = useState(ev)

  // Si el servidor trae un resultado nuevo (el juez terminó), el formulario lo toma, salvo que se esté editando.
  if (ev && ultimo && ev !== ultimo && (ev.estado !== ultimo.estado || ev.puntajeFinal !== ultimo.puntajeFinal) && !guardando) {
    setUltimo(ev)
    setPuntaje(ev.puntajeFinal ?? Number.NaN)
    setFeedback(ev.feedbackFinal ?? '')
    setClave((k) => k + 1)
  }

  if (!ev) return null
  const estado = ESTADO_EVALUACION[ev.estado]
  const enCola = ev.estado === 'pendiente' || ev.estado === 'procesando'
  const alerta = ev.estado === 'error' || ev.estado === 'manual' ? 'alerta-error' : ev.bajaConfianza && ev.estado !== 'revisada' ? 'alerta-confianza' : ev.respuestaVacia ? 'alerta-vacia' : ''

  async function guardar(event) {
    event.preventDefault()
    if (!Number.isFinite(puntaje) || puntaje < 0 || puntaje > ev.puntajeMax) {
      setError(`El puntaje tiene que ser un número entre 0 y ${pts(ev.puntajeMax)}.`)
      return
    }
    if (feedback.length > FEEDBACK_MAXIMO) {
      setError(`El feedback puede tener hasta ${FEEDBACK_MAXIMO} caracteres.`)
      return
    }
    setGuardando(true)
    setError('')
    try {
      const r = await ajustarEvaluacion(entregaId, block.id, { puntaje: Math.round(puntaje * 100) / 100, feedback })
      setUltimo(r.evaluacion)
      onGuardado(r)
      setGuardado(true)
    } catch (e) {
      setError(e.sinConexion ? 'Sin conexión con el servidor: no se guardó. Probá de nuevo.' : e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className={`card block revision-item ${alerta}`} aria-label={`Pregunta ${index + 1}`}>
      <div className="block-header">
        <span className="block-type">
          {index + 1}. {BLOCK_TYPES[block.tipo]}
          {block.tipo === 'codigo' && ` · ${CODE_LANGUAGES[block.lenguaje] ?? block.lenguaje}`}
        </span>
        <span className="revision-puntos">{pts(ev.puntajeFinal)} <span className="muted">/ {pts(ev.puntajeMax)}</span></span>
      </div>
      <p className="chips-line revision-alertas">
        <span className={estado.className}>{estado.label}</span>
        {ev.respuestaVacia && <span className="chip">Respuesta vacía · requiere revisión</span>}
        {ev.bajaConfianza && <span className="chip pending">Baja confianza{ev.confianza != null && ` (${pct(ev.confianza)})`} · revisión prioritaria</span>}
        {ev.estado === 'pendiente' && ev.intentos > 0 && <span className="chip pending">Reintento {ev.intentos + 1} de 3</span>}
      </p>
      {block.consigna && <div className="content block-prompt">{block.consigna}</div>}
      {block.tipo === 'texto' && block.contenido && <div className="content block-text">{block.contenido}</div>}
      <div className="block-answer">
        <span className="block-answer-label">Respuesta del alumno</span>
        <BlockAnswer block={block} value={respuesta} readOnly showCorrect />
      </div>

      {enCola ? (
        <p className="muted small" role="status">{ev.estado === 'procesando' ? 'Un agente juez está corrigiendo esta respuesta…' : 'En cola para el agente juez…'}</p>
      ) : (
        <div className="block-section revision-ia">
          <span className="block-answer-label">
            {ev.estado === 'manual' ? 'Corrección manual' : ev.estado === 'error' ? 'Error del agente juez' : 'Evaluación automática'}
          </span>
          {ev.estado === 'error' && (
            <p className="error small">Falló después de {ev.intentos} intentos: {ev.ultimoError}. La respuesta quedó intacta; asignale el puntaje a mano.</p>
          )}
          {ev.estado === 'manual' && <p className="muted small">Las construcciones de GeoGebra no las corrige la IA: asignale el puntaje.</p>}
          {ev.puntajeSugerido != null && (
            <p className="small revision-sugerido">
              Sugerido: <strong>{pts(ev.puntajeSugerido)} / {pts(ev.puntajeMax)}</strong>
              {ev.confianza != null && !String(ev.juez?.modelo ?? '').startsWith('regla-') && (
                <span className="muted"> · confianza informada por el juez {pct(ev.confianza)}</span>
              )}
              {ev.juez?.modelo === 'regla-opcion-correcta' && <span className="muted"> · comparada con la opción correcta</span>}
            </p>
          )}
          {ev.criterios.length > 0 && ev.estado !== 'error' && (
            <ul className="revision-criterios">
              {ev.criterios.map((c) => {
                const nivel = NIVEL[c.cumplimiento] ?? NIVEL[0]
                return (
                  <li key={c.id} className={nivel.clase}>
                    <span aria-hidden="true" className="revision-criterio-icono">{nivel.icono}</span>
                    <span>
                      <strong>{c.texto}</strong> <span className="muted small">(peso {pts(c.peso)} · {nivel.texto})</span>
                      {c.justificacion && <span className="muted small table-sub">{c.justificacion}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          {ev.feedbackSugerido && ev.feedbackSugerido !== ev.feedbackFinal && (
            <p className="muted small">Feedback sugerido por la IA: {ev.feedbackSugerido}</p>
          )}
        </div>
      )}

      <form className="form revision-form" onSubmit={guardar} noValidate>
        <div className="revision-form-row">
          <label className="block-field">
            Puntaje definitivo (0 a {pts(ev.puntajeMax)})
            <CampoNumero key={clave} className="grade-input" label="Puntaje definitivo" value={puntaje}
              onChange={(v) => { setPuntaje(v); setGuardado(false) }} disabled={bloqueada} />
          </label>
        </div>
        <label className="block-field">
          <span>Feedback para el alumno</span>
          <textarea rows={3} value={feedback} maxLength={FEEDBACK_MAXIMO} disabled={bloqueada}
            onChange={(e) => { setFeedback(e.target.value); setGuardado(false) }} placeholder="Devolución de esta pregunta…" />
          <span className="muted hint">{feedback.length}/{FEEDBACK_MAXIMO}</span>
        </label>
        {error && <p className="error">{error}</p>}
        {!bloqueada && (
          <div className="actions grading-actions">
            <button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
            {guardado && <span className="muted small">Guardado. Nota recalculada.</span>}
            {ev.estado === 'revisada' && ev.revisadaPor && (
              <span className="muted small">Revisada por {nombreDe(ev.revisadaPor)}{ev.fechaRevision && ` el ${formatDate(ev.fechaRevision)}`}</span>
            )}
          </div>
        )}
      </form>
    </section>
  )
}

// Entregas anteriores a la corrección automática: la nota única de siempre, y la opción de corregirla con IA.
function SinCorreccionPorPregunta({ entrega, onCambio }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const publicada = entrega.estadoCorreccion === 'publicado'
  return (
    <>
      {!publicada && (
        <div className="card notice">
          <span>Esta entrega no tiene corrección automática.</span>
          <button type="button" className="secondary" disabled={ocupado} onClick={async () => {
            setOcupado(true)
            try {
              await reevaluarEntrega(entrega.id)
              onCambio()
            } catch (e) {
              setError(e.message)
            } finally {
              setOcupado(false)
            }
          }}>Corregir con agentes jueces</button>
          {error && <span className="error small">{error}</span>}
        </div>
      )}
      <div className="blocks">
        <ExamBlocks blocks={entrega.bloques} respuestas={entrega.respuestas} readOnly showCorrect />
      </div>
      <GradingForm entrega={entrega} onGraded={onCambio} />
    </>
  )
}

function Incidentes({ eventos }) {
  const incidentes = eventos.filter((ev) => ev.tipo === 'INCIDENT').length
  return (
    <section className="card revision-seccion" aria-label="Incidentes durante la rendición">
      <div className="grading-header">
        <h2>Rendición en modo restringido</h2>
        <span className={incidentes > 0 ? 'chip incident' : 'chip published'}>
          {incidentes === 0 ? 'Sin incidentes' : incidentes === 1 ? '1 incidente' : `${incidentes} incidentes`}
        </span>
      </div>
      <LineaDeTiempo eventos={eventos} />
    </section>
  )
}

const ACCION = { puntaje: 'Puntaje', feedback: 'Feedback', publicacion: 'Publicación', reevaluacion: 'Reenvío a los jueces' }

function Historial({ auditoria, evaluaciones }) {
  const orden = new Map(evaluaciones.map((ev) => [ev.bloqueId, ev.orden + 1]))
  const valor = (v) => (v == null || v === '' ? '—' : typeof v === 'number' ? pts(v) : typeof v === 'object' ? `nota ${pts(v.nota)}` : String(v))
  return (
    <section className="card revision-seccion" aria-label="Historial de cambios">
      <h2>Historial de cambios</h2>
      {auditoria.length === 0 ? (
        <p className="muted small">Todavía no hay cambios del profesor.</p>
      ) : (
        <ol className="timeline auditoria">
          {auditoria.map((a) => (
            <li key={a.id} className={a.accion === 'publicacion' ? 'timeline-item done' : 'timeline-item'}>
              <time dateTime={a.fecha} className="timeline-time">{formatDate(a.fecha)}</time>
              <span className="timeline-text">
                <strong>{ACCION[a.accion]}</strong>{a.bloqueId && ` · pregunta ${orden.get(a.bloqueId) ?? '?'}`} · {a.actorNombre}
                {a.accion !== 'publicacion' && a.accion !== 'reevaluacion' && (
                  <span className="muted small table-sub">
                    <del>{valor(a.valorAnterior)}</del> → {valor(a.valorNuevo)}
                  </span>
                )}
                {a.accion === 'publicacion' && <span className="muted small table-sub">{valor(a.valorNuevo)}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
