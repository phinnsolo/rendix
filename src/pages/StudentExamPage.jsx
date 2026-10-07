import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSession } from '../auth.js'
import { getPublishedDocumentOf } from '../documentsStore.js'
import { emptyAnswer, getBlocks } from '../documentBlocks.js'
import { getHerramientas, getTema } from '../examSettings.js'
import { formatDate } from '../formatDate.js'
import { getDraftAnswers, getSubmissionOf, saveDraftAnswers, submitExam } from '../submissionsStore.js'
import ExamBlocks from '../components/ExamBlocks.jsx'
import ExamHeader from '../components/ExamHeader.jsx'
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

export default function StudentExamPage() {
  const { id } = useParams()
  const session = getSession()
  const doc = getPublishedDocumentOf(session.profesor, id)
  const [entrega, setEntrega] = useState(() => getSubmissionOf(session.profesor, id, session.username))

  if (!entrega && !doc) {
    return <NotFound backTo="/alumno" backLabel="Volver a parciales" />
  }

  return (
    <>
      <p><Link to="/alumno">← Volver a parciales</Link></p>
      {entrega
        ? <SubmittedExam entrega={entrega} />
        : <ExamInProgress doc={doc} onSubmitted={setEntrega} />}
    </>
  )
}

function ExamInProgress({ doc, onSubmitted }) {
  const [blocks] = useState(() => getBlocks(doc))
  const [respuestas, setRespuestas] = useState(() => initialAnswers(blocks, doc.id))
  const [error, setError] = useState('')
  const geogebraApis = useRef(new Map())

  // El progreso se guarda en cada cambio para no perderlo al recargar. GeoGebra se lee recién al enviar.
  useEffect(() => {
    const sinGeoGebra = Object.fromEntries(
      blocks.filter((block) => block.tipo !== 'geogebra').map((block) => [block.id, respuestas[block.id]])
    )
    saveDraftAnswers(doc.id, sinGeoGebra)
  }, [blocks, doc.id, respuestas])

  function handleSubmit() {
    const sinResponder = blocks.filter((block) => isUnanswered(block, respuestas[block.id])).length
    const aviso = sinResponder === 0
      ? ''
      : sinResponder === 1 ? 'Tenés 1 apartado sin responder. ' : `Tenés ${sinResponder} apartados sin responder. `
    if (!window.confirm(`${aviso}Una vez enviado no se puede modificar. ¿Enviar el parcial?`)) return

    const finales = { ...respuestas }
    for (const [blockId, api] of geogebraApis.current) finales[blockId] = api.getBase64()
    try {
      onSubmitted(submitExam(doc, finales))
      window.scrollTo(0, 0)
    } catch (e) {
      setError(e.message.startsWith('Este parcial') ? e.message : 'No se pudo enviar: el almacenamiento del navegador está lleno.')
    }
  }

  return (
    <>
      <h1>{doc.titulo}</h1>
      <ExamHeader tema={getTema(doc)} herramientas={getHerramientas(doc)} />
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
        <span className="chip published">Entregado</span> Enviaste este parcial el {formatDate(entrega.fechaEntrega)}. Ya no se puede modificar.
      </div>
      <ExamHeader tema={entrega.tema} herramientas={entrega.herramientas} />
      <div className="blocks">
        <ExamBlocks blocks={entrega.bloques} respuestas={entrega.respuestas} readOnly />
      </div>
    </>
  )
}
