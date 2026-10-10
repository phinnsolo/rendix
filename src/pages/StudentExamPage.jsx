import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSession } from '../auth.js'
import { getPublishedDocumentOf } from '../documentsStore.js'
import { emptyAnswer, getBlocks } from '../documentBlocks.js'
import { getDuracion, getHerramientas, getTema } from '../examSettings.js'
import { formatDate } from '../formatDate.js'
import { getDraftAnswers, getSubmissionOf, saveDraftAnswers, submitExam } from '../submissionsStore.js'
import { estadoTurno, formatHorario, getApertura, getTurnoDeAlumno, registrarApertura, turnoFin, turnoInicio } from '../turnosStore.js'
import ExamBlocks from '../components/ExamBlocks.jsx'
import ExamHeader from '../components/ExamHeader.jsx'
import ExamToolsPanel from '../components/ExamToolsPanel.jsx'
import NotFound from '../components/NotFound.jsx'

function initialAnswers(blocks, parcialId) {
  const draft = getDraftAnswers(parcialId) || {}
  return Object.fromEntries(blocks.map((block) => [block.id, draft[block.id] ?? emptyAnswer(block)]))
}

// GeoGebra no cuenta: su respuesta vive dentro del applet hasta que se envía.
function isUnanswered(block, value) {
  if (block.tipo === 'opcion-multiple') return value == null
  if (block.tipo === 'codigo') return value.trim() === block.contenido.trim()
  if (block.tipo === 'texto') return !value.trim()
  return false
}

// Solo se puede abrir si el alumno está asignado a un turno de este parcial, y dentro de su horario.
// Después pasa por: sin abrir → resolviendo (con reloj) → entregado.
export default function StudentExamPage() {
  const { id } = useParams()
  const session = getSession()
  const [turno] = useState(() => getTurnoDeAlumno(session.username, id))
  const doc = turno ? getPublishedDocumentOf(turno.profesor, id) : null
  const [entrega, setEntrega] = useState(() => (turno ? getSubmissionOf(turno.profesor, id, session.username) : null))
  const [inicio, setInicio] = useState(() => getApertura(turno, session.username))
  // Mientras espera el inicio del turno, la página se actualiza sola para habilitar el botón.
  const estado = turno ? estadoTurno(turno) : null
  const [, tick] = useState(0)
  useEffect(() => {
    if (estado !== 'proximo') return
    const timer = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [estado])

  if (!turno || (!entrega && !doc)) {
    return <NotFound backTo="/alumno" backLabel="Volver a parciales" />
  }

  let content
  if (entrega) content = <SubmittedExam entrega={entrega} />
  else if (inicio) content = <ExamInProgress doc={doc} turno={turno} inicio={inicio} onSubmitted={setEntrega} />
  else if (estado === 'en-curso') {
    content = <ExamIntro doc={doc} turno={turno} onStart={() => setInicio(registrarApertura(turno, session.username))} />
  } else content = <ExamUnavailable doc={doc} turno={turno} estado={estado} />

  return (
    <>
      <p><Link to={entrega ? '/alumno?tab=entregados' : '/alumno'}>← Volver a parciales</Link></p>
      {content}
    </>
  )
}

// Fuera del horario del turno: se muestra el motivo y no se puede abrir.
function ExamUnavailable({ doc, turno, estado }) {
  const motivo = estado === 'proximo'
    ? `El parcial empieza el ${turnoInicio(turno).toLocaleDateString('es-AR')} a las ${turno.horaInicio}. Vas a poder abrirlo a partir de ese momento.`
    : `El parcial terminó el ${turnoFin(turno).toLocaleDateString('es-AR')} a las ${turno.horaFin}. Ya no se puede abrir.`

  return (
    <>
      <h1>{doc.titulo}</h1>
      <div className="card exam-wait">
        <span className={estado === 'proximo' ? 'chip' : 'chip incorrect'}>
          {estado === 'proximo' ? 'Todavía no empezó' : 'Turno finalizado'}
        </span>
        <p>{motivo}</p>
        <p className="muted small">Horario del turno: {formatHorario(turno)}</p>
      </div>
    </>
  )
}

function ExamIntro({ doc, turno, onStart }) {
  const duracion = getDuracion(doc)
  const apartados = getBlocks(doc).length

  function handleStart() {
    if (estadoTurno(turno) !== 'en-curso') {
      window.alert('El turno ya no está en curso: no se puede abrir el parcial.')
      return
    }
    const mensaje = `Tenés hasta las ${turno.horaFin}. El tiempo corre y no se puede pausar. ¿Comenzar?`
    if (window.confirm(mensaje)) onStart()
  }

  return (
    <>
      <h1>{doc.titulo}</h1>
      <ExamHeader tema={getTema(doc)} herramientas={getHerramientas(doc)} duracion={duracion} />
      <div className="card exam-start">
        <p>
          {apartados === 1 ? 'El parcial tiene 1 apartado.' : `El parcial tiene ${apartados} apartados.`}{' '}
          El parcial es de {turno.horaInicio} a {turno.horaFin}: si lo empezás más tarde tenés menos tiempo, y a las{' '}
          {turno.horaFin} se envía lo que hayas respondido.
        </p>
        <p className="muted small">Una vez enviado no se puede modificar.</p>
        <div className="actions">
          <button type="button" onClick={handleStart}>Comenzar parcial</button>
        </div>
      </div>
    </>
  )
}

function ExamInProgress({ doc, turno, inicio, onSubmitted }) {
  const [blocks] = useState(() => getBlocks(doc))
  const [respuestas, setRespuestas] = useState(() => initialAnswers(blocks, doc.id))
  const [error, setError] = useState('')
  const geogebraApis = useRef(new Map())
  const enviado = useRef(false)

  const duracion = getDuracion(doc)
  // El tiempo termina con la duración del parcial o con el fin del turno, lo que llegue antes.
  const finTurno = turnoFin(turno).getTime()
  const deadline = duracion == null ? finTurno : Math.min(Date.parse(inicio) + duracion * 60_000, finTurno)
  const [ahora, setAhora] = useState(Date.now)
  const segundosRestantes = Math.max(0, Math.ceil((deadline - ahora) / 1000))

  useEffect(() => {
    const timer = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // El progreso se guarda en cada cambio para no perderlo al recargar. GeoGebra se lee recién al enviar.
  useEffect(() => {
    const sinGeoGebra = Object.fromEntries(
      blocks.filter((block) => block.tipo !== 'geogebra').map((block) => [block.id, respuestas[block.id]])
    )
    saveDraftAnswers(doc.id, sinGeoGebra)
  }, [blocks, doc.id, respuestas])

  function enviar({ automatico }) {
    if (enviado.current) return
    const finales = { ...respuestas }
    for (const [blockId, api] of geogebraApis.current) finales[blockId] = api.getBase64()
    try {
      const entrega = submitExam({ ...doc, profesor: turno.profesor }, finales, { automatico, fechaInicio: inicio })
      enviado.current = true
      onSubmitted(entrega)
      window.scrollTo(0, 0)
    } catch (e) {
      setError(e.message.startsWith('Este parcial') ? e.message : 'No se pudo enviar: el almacenamiento del navegador está lleno.')
    }
  }

  // Se terminó el tiempo (o ya había terminado al abrir la página): se envía con lo respondido.
  useEffect(() => {
    if (segundosRestantes === 0) enviar({ automatico: true })
  })

  function handleSubmit() {
    const sinResponder = blocks.filter((block) => isUnanswered(block, respuestas[block.id])).length
    const aviso = sinResponder === 0
      ? ''
      : sinResponder === 1 ? 'Tenés 1 apartado sin responder. ' : `Tenés ${sinResponder} apartados sin responder. `
    if (window.confirm(`${aviso}Una vez enviado no se puede modificar. ¿Enviar el parcial?`)) {
      enviar({ automatico: false })
    }
  }

  return (
    <>
      <h1>{doc.titulo}</h1>
      <ExamHeader
        tema={getTema(doc)}
        herramientas={getHerramientas(doc)}
        duracion={duracion}
        segundosRestantes={segundosRestantes}
        sticky
      />
      <ExamToolsPanel herramientas={getHerramientas(doc)} />
      <div className="blocks">
        <ExamBlocks
          blocks={blocks}
          respuestas={respuestas}
          onChange={(blockId, value) => setRespuestas((current) => ({ ...current, [blockId]: value }))}
          onGeoGebraReady={(blockId, api) => {
            if (api) geogebraApis.current.set(blockId, api)
            else geogebraApis.current.delete(blockId)
          }}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions exam-submit">
        <button type="button" onClick={handleSubmit}>Enviar parcial</button>
        <span className="muted small">Tus respuestas se guardan en este navegador hasta que lo envíes.</span>
      </div>
    </>
  )
}

function SubmittedExam({ entrega }) {
  return (
    <>
      <h1>{entrega.titulo}</h1>
      <div className="card notice">
        <span className="chip published">Entregado</span>
        {entrega.enviadoPorTiempo
          ? `Se terminó el tiempo: tu parcial se envió automáticamente (${formatDate(entrega.fechaEntrega)}).`
          : `Enviaste este parcial el ${formatDate(entrega.fechaEntrega)} · Ya no se puede modificar.`}
      </div>
      <GradeCard correccion={entrega.correccion} />
      <ExamHeader tema={entrega.tema} herramientas={entrega.herramientas} duracion={entrega.duracion ?? null} />
      <div className="blocks">
        <ExamBlocks blocks={entrega.bloques} respuestas={entrega.respuestas} readOnly />
      </div>
    </>
  )
}

// Nota y devolución que dejó el profesor (sin las marcas de correcta/incorrecta del multiple choice).
function GradeCard({ correccion }) {
  if (!correccion) {
    return (
      <div className="card grade-card pending">
        <h2>Corrección</h2>
        <p className="muted">Tu profesor todavía no corrigió este parcial.</p>
      </div>
    )
  }

  return (
    <div className="card grade-card">
      <div className="grade-card-header">
        <h2>Corrección</h2>
        <span className="muted small">Corregido el {formatDate(correccion.fecha)}</span>
      </div>
      <p className="grade-value"><strong>{correccion.nota}</strong> <span className="muted">/ 10</span></p>
      {correccion.comentario && (
        <div className="grade-feedback">
          <span className="block-answer-label">Devolución del profesor</span>
          <div className="content">{correccion.comentario}</div>
        </div>
      )}
    </div>
  )
}
