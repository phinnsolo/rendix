import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSession } from '../auth.js'
import { getPublishedDocumentOf } from '../documentsStore.js'
import { emptyAnswer, getBlocks } from '../documentBlocks.js'
import { getDuracion, getHerramientas, getTema } from '../examSettings.js'
import { formatDate } from '../formatDate.js'
import {
  getDraftAnswers,
  getExamStart,
  getSubmissionOf,
  saveDraftAnswers,
  startExam,
  submitExam,
} from '../submissionsStore.js'
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

// El parcial pasa por tres estados: sin empezar → resolviendo (con reloj) → entregado.
export default function StudentExamPage() {
  const { id } = useParams()
  const session = getSession()
  const doc = getPublishedDocumentOf(session.profesor, id)
  const [entrega, setEntrega] = useState(() => getSubmissionOf(session.profesor, id, session.username))
  const [inicio, setInicio] = useState(() => getExamStart(id))

  if (!entrega && !doc) {
    return <NotFound backTo="/alumno" backLabel="Volver a parciales" />
  }

  let content
  if (entrega) content = <SubmittedExam entrega={entrega} />
  else if (!inicio) content = <ExamIntro doc={doc} onStart={() => setInicio(startExam(doc.id))} />
  else content = <ExamInProgress doc={doc} inicio={inicio} onSubmitted={setEntrega} />

  return (
    <>
      <p><Link to={entrega ? '/alumno?tab=entregados' : '/alumno'}>← Volver a parciales</Link></p>
      {content}
    </>
  )
}

function ExamIntro({ doc, onStart }) {
  const duracion = getDuracion(doc)
  const apartados = getBlocks(doc).length

  function handleStart() {
    const mensaje = duracion == null
      ? '¿Comenzar el parcial?'
      : `Tenés ${duracion} minutos. El tiempo empieza a correr y no se puede pausar. ¿Comenzar?`
    if (window.confirm(mensaje)) onStart()
  }

  return (
    <>
      <h1>{doc.titulo}</h1>
      <ExamHeader tema={getTema(doc)} herramientas={getHerramientas(doc)} duracion={duracion} />
      <div className="card exam-start">
        <p>
          {apartados === 1 ? 'El parcial tiene 1 apartado.' : `El parcial tiene ${apartados} apartados.`}{' '}
          {duracion == null
            ? 'No tiene límite de tiempo.'
            : `Vas a tener ${duracion} minutos desde que lo comiences; al terminar el tiempo se envía automáticamente.`}
        </p>
        <p className="muted small">Una vez enviado no se puede modificar.</p>
        <div className="actions">
          <button type="button" onClick={handleStart}>Comenzar parcial</button>
        </div>
      </div>
    </>
  )
}

function ExamInProgress({ doc, inicio, onSubmitted }) {
  const [blocks] = useState(() => getBlocks(doc))
  const [respuestas, setRespuestas] = useState(() => initialAnswers(blocks, doc.id))
  const [error, setError] = useState('')
  const geogebraApis = useRef(new Map())
  const enviado = useRef(false)

  const duracion = getDuracion(doc)
  const deadline = duracion == null ? null : Date.parse(inicio) + duracion * 60_000
  const [ahora, setAhora] = useState(Date.now)
  const segundosRestantes = deadline == null ? null : Math.max(0, Math.ceil((deadline - ahora) / 1000))

  useEffect(() => {
    if (deadline == null) return
    const timer = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [deadline])

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
      const entrega = submitExam(doc, finales, { automatico })
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
