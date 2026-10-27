import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { request } from '../api.js'
import { getSession } from '../auth.js'
import { getClase } from '../clasesStore.js'
import { emptyAnswer, getBlocks } from '../documentBlocks.js'
import { getDuracion, getHerramientas, getTema } from '../examSettings.js'
import { formatDate } from '../formatDate.js'
import { estadoTurno, formatHorario, turnoFin, turnoInicio } from '../turnosStore.js'
import { ZONA_HORARIA_IANA } from '../config.js'
import { borrarCache, respuestasIniciales, useAutosave, useRestante } from '../useExamSession.js'
import ExamBlocks from '../components/ExamBlocks.jsx'
import ExamHeader from '../components/ExamHeader.jsx'
import ExamToolsPanel from '../components/ExamToolsPanel.jsx'
import NotFound from '../components/NotFound.jsx'
import BackLink from '../components/BackLink.jsx'

// GeoGebra no cuenta: su respuesta vive dentro del applet hasta que se envía.
function isUnanswered(block, value) {
  if (block.tipo === 'opcion-multiple') return value == null
  if (block.tipo === 'codigo') return (value ?? '').trim() === block.contenido.trim()
  if (block.tipo === 'texto') return !(value ?? '').trim()
  return false
}

const fechaAR = (fecha) => fecha.toLocaleDateString('es-AR', { timeZone: ZONA_HORARIA_IANA })

// Solo se puede abrir si el alumno está asignado a un turno de este parcial, y dentro de su horario.
// Después pasa por: sin abrir → resolviendo (con reloj) → entregado. El estado lo tiene el servidor: al
// recargar o volver a entrar desde otro dispositivo se retoma donde quedó.
export default function StudentExamPage() {
  const { id } = useParams()
  // Con ?clase=<id> (al entrar desde una clase), "Volver" lleva a esa clase.
  const [searchParams] = useSearchParams()
  const clase = getClase(searchParams.get('clase'))
  const [examen, setExamen] = useState(null) // { turno, documento, sesion, entrega }
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    try {
      setExamen(await request('GET', `/api/examen/${id}`))
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [id])
  useEffect(() => {
    cargar()
  }, [cargar])

  // Sin conexión al cargar: se reintenta solo.
  useEffect(() => {
    if (!error?.sinConexion) return
    const timer = setTimeout(cargar, 2000)
    return () => clearTimeout(timer)
  }, [error, cargar])

  const back = clase
    ? <BackLink to={`/alumno/clases/${clase.id}`}>Volver a {clase.nombre}</BackLink>
    : <BackLink to={examen?.entrega ? '/alumno/parciales?tab=entregados' : '/alumno/parciales'}>Volver a parciales</BackLink>

  if (error && !error.sinConexion) {
    return clase
      ? <NotFound backTo={`/alumno/clases/${clase.id}`} backLabel={`Volver a ${clase.nombre}`} />
      : <NotFound backTo="/alumno/parciales" backLabel="Volver a parciales" />
  }
  if (!examen) {
    return (
      <>
        {back}
        <p className="muted" role="status">{error ? 'Sin conexión con el servidor. Reintentando…' : 'Cargando…'}</p>
      </>
    )
  }

  const { turno, documento: doc, sesion, entrega } = examen
  let content
  if (entrega) content = <SubmittedExam entrega={entrega} />
  else if (sesion) {
    content = (
      <ExamInProgress
        key={sesion.apertura}
        doc={doc}
        sesion={sesion}
        onEntregado={(nueva) => setExamen((actual) => ({ ...actual, entrega: nueva }))}
        onCerrado={cargar}
      />
    )
  } else content = <ExamNotStarted doc={doc} turno={turno} onStarted={(nueva) => setExamen((actual) => ({ ...actual, sesion: nueva }))} />

  return (
    <>
      {back}
      {content}
    </>
  )
}

// Antes de empezar: si el turno está en curso se puede comenzar; si no, se muestra el motivo. Mientras espera
// el inicio, la página se actualiza sola para habilitar el botón.
function ExamNotStarted({ doc, turno, onStarted }) {
  const estado = estadoTurno(turno)
  const [, tick] = useState(0)
  useEffect(() => {
    if (estado !== 'proximo') return
    const timer = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [estado])

  if (estado === 'en-curso') return <ExamIntro doc={doc} turno={turno} onStarted={onStarted} />
  return <ExamUnavailable doc={doc} turno={turno} estado={estado} />
}

// Fuera del horario del turno: se muestra el motivo y no se puede abrir.
function ExamUnavailable({ doc, turno, estado }) {
  const motivo = estado === 'proximo'
    ? `El parcial empieza el ${fechaAR(turnoInicio(turno))} a las ${turno.horaInicio}. Vas a poder abrirlo a partir de ese momento.`
    : `El parcial terminó el ${fechaAR(turnoFin(turno))} a las ${turno.horaFin}. Ya no se puede abrir.`

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

function ExamIntro({ doc, turno, onStarted }) {
  const duracion = getDuracion(doc)
  const apartados = getBlocks(doc).length
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handleStart() {
    const mensaje = `Tenés hasta las ${turno.horaFin}. El tiempo corre y no se puede pausar. ¿Comenzar?`
    if (!window.confirm(mensaje)) return
    setEnviando(true)
    try {
      const { sesion } = await request('POST', `/api/examen/${doc.id}/comenzar`)
      onStarted(sesion)
    } catch (e) {
      setError(e.message)
      setEnviando(false)
    }
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
        <p className="muted small">
          Tus respuestas se guardan solas mientras escribís. Si se corta la conexión o se cierra el navegador, al volver
          a entrar seguís donde estabas. Una vez enviado no se puede modificar.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={handleStart} disabled={enviando}>Comenzar parcial</button>
        </div>
      </div>
    </>
  )
}

// Avisos de tiempo: se muestra uno al cruzar cada umbral (o al entrar si ya se cruzó).
const AVISOS = [
  { ms: 60_000, texto: 'Queda 1 minuto. Al llegar a cero el parcial se envía solo.' },
  { ms: 5 * 60_000, texto: 'Quedan 5 minutos.' },
  { ms: 10 * 60_000, texto: 'Quedan 10 minutos.' },
]
const AVISO_VISIBLE_MS = 10_000
// Si al llegar a cero no hay conexión, se reintenta la entrega durante este tiempo antes de avisar.
const ESPERA_ENTREGA_MS = 3000

function ExamInProgress({ doc, sesion, onEntregado, onCerrado }) {
  const alumno = getSession().username
  const [blocks] = useState(() => getBlocks(doc))
  const [inicial] = useState(() => {
    const { respuestas, seq } = respuestasIniciales(alumno, doc.id, sesion)
    return { respuestas: Object.fromEntries(blocks.map((b) => [b.id, respuestas[b.id] ?? emptyAnswer(b)])), seq }
  })
  const restante = useRestante(sesion.deadline)
  const vencido = restante === 0
  const [entrega, setEntrega] = useState(null) // null | 'enviando' | 'sin-conexion'
  const [error, setError] = useState('')
  const bloqueado = vencido || entrega !== null
  const { respuestas, respRef, seqRef, cambiar, estado } = useAutosave({
    alumno, parcialId: doc.id, inicial, serverSeq: sesion.seq, bloqueado, onCerrado,
  })
  const geogebraApis = useRef(new Map())
  const enviado = useRef(false)

  const duracion = getDuracion(doc)

  // Aviso del umbral más chico ya cruzado; se cierra solo.
  const umbral = AVISOS.find((a) => restante <= a.ms && !vencido) ?? null
  const [aviso, setAviso] = useState(null)
  const ultimoUmbral = useRef(null)
  useEffect(() => {
    if (!umbral || umbral === ultimoUmbral.current) return
    ultimoUmbral.current = umbral
    setAviso(umbral.texto)
    const timer = setTimeout(() => setAviso(null), AVISO_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [umbral])

  // GeoGebra no avisa cada cambio por onChange: se escucha el applet y se guarda medio segundo después.
  function handleGeoGebraReady(blockId, api) {
    if (!api) {
      geogebraApis.current.delete(blockId)
      return
    }
    geogebraApis.current.set(blockId, api)
    let timer = null
    const alCambiar = () => {
      clearTimeout(timer)
      timer = setTimeout(() => cambiar(blockId, api.getBase64()), 500)
    }
    api.registerUpdateListener?.(alCambiar)
    api.registerAddListener?.(alCambiar)
    api.registerRemoveListener?.(alCambiar)
  }

  // Manda la entrega. Automática: reintenta sin conexión hasta que el servidor responda (que entrega lo
  // último guardado si ya pasó la hora límite).
  const enviar = useCallback(async ({ automatico }) => {
    if (enviado.current) return
    enviado.current = true
    setEntrega('enviando')
    setError('')
    const finales = { ...respRef.current }
    for (const [blockId, api] of geogebraApis.current) finales[blockId] = api.getBase64()
    const desde = performance.now()
    for (;;) {
      try {
        const { entrega: nueva } = await request('POST', `/api/examen/${doc.id}/entregar`, { respuestas: finales, seq: seqRef.current + 1, automatico })
        borrarCache(alumno, doc.id)
        onEntregado(nueva)
        window.scrollTo(0, 0)
        return
      } catch (e) {
        if (!e.sinConexion || !automatico) {
          enviado.current = false
          setEntrega(null)
          setError(e.sinConexion
            ? 'Sin conexión: tus respuestas quedan guardadas en este dispositivo. Probá enviar de nuevo.'
            : `No se pudo enviar. ${e.message}`)
          return
        }
        if (performance.now() - desde > ESPERA_ENTREGA_MS) setEntrega('sin-conexion')
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
  }, [alumno, doc.id, onEntregado, respRef, seqRef])

  // Se terminó el tiempo (o ya había terminado al abrir la página): se bloquea y se envía lo respondido.
  useEffect(() => {
    if (vencido) enviar({ automatico: true })
  }, [vencido, enviar])

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
        segundosRestantes={Math.ceil(restante / 1000)}
        estadoGuardado={bloqueado ? null : estado}
        sticky
      />
      <div className="exam-alerts" aria-live="assertive">
        {aviso && !bloqueado && (
          <div className={restante <= 60_000 ? 'exam-alert urgent' : 'exam-alert'}>
            <span>{aviso}</span>
            <button type="button" className="exam-alert-close" onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
          </div>
        )}
        {vencido && (
          <div className="exam-alert urgent">
            {entrega === 'sin-conexion'
              ? 'Se terminó el tiempo y no hay conexión. Se entrega lo último que se guardó; al volver la conexión vas a ver tu entrega.'
              : 'Se terminó el tiempo. Enviando tu parcial…'}
          </div>
        )}
      </div>
      <ExamToolsPanel herramientas={getHerramientas(doc)} />
      <div className={bloqueado ? 'blocks exam-locked' : 'blocks'} inert={bloqueado}>
        <ExamBlocks
          blocks={blocks}
          respuestas={respuestas}
          readOnly={bloqueado}
          onChange={cambiar}
          onGeoGebraReady={handleGeoGebraReady}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions exam-submit">
        <button type="button" onClick={handleSubmit} disabled={bloqueado}>
          {entrega === 'enviando' && !vencido ? 'Enviando…' : 'Enviar parcial'}
        </button>
        <span className="muted small">Tus respuestas se guardan solas mientras escribís.</span>
      </div>
    </>
  )
}

function SubmittedExam({ entrega }) {
  return (
    <>
      <h1>{entrega.titulo}</h1>
      <div className="card notice">
        <span className="chip published">{entrega.enviadoPorTiempo || entrega.enviadoPorSistema ? 'Enviado por vencimiento' : 'Entregado'}</span>
        {entrega.enviadoPorTiempo || entrega.enviadoPorSistema
          ? `Enviado por vencimiento: se terminó el tiempo y tu parcial se entregó automáticamente con lo último guardado (${formatDate(entrega.fechaEntrega)}).`
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
