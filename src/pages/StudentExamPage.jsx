import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { request } from '../api.js'
import { getSession } from '../auth.js'
import { getClase } from '../clasesStore.js'
import { emptyAnswer, getBlocks } from '../documentBlocks.js'
import { getDuracion, getHerramientas, getTema } from '../examSettings.js'
import { sincronizarPendientes, triggerExamIncident, nuevoEventoId } from '../examSecurity.js'
import { formatDate } from '../formatDate.js'
import { enPantallaCompleta, salirPantallaCompleta } from '../restrictedMode.js'
import { estadoTurno, formatHorario, turnoFin, turnoInicio } from '../turnosStore.js'
import { ZONA_HORARIA_IANA } from '../config.js'
import { borrarCache, respuestasIniciales, useAutosave, useRestante } from '../useExamSession.js'
import { useRestrictedExamMode } from '../useRestrictedExamMode.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ExamBlocks from '../components/ExamBlocks.jsx'
import ExamHeader from '../components/ExamHeader.jsx'
import ExamToolsPanel from '../components/ExamToolsPanel.jsx'
import NotFound from '../components/NotFound.jsx'
import BackLink from '../components/BackLink.jsx'
import { ExamenInterrumpido, ReglasModoRestringido } from '../components/RestrictedMode.jsx'

// GeoGebra no cuenta: su respuesta vive dentro del applet hasta que se envía.
function isUnanswered(block, value) {
  if (block.tipo === 'opcion-multiple') return value == null
  if (block.tipo === 'codigo') return (value ?? '').trim() === block.contenido.trim()
  if (block.tipo === 'texto') return !(value ?? '').trim()
  return false
}

const fechaAR = (fecha) => fecha.toLocaleDateString('es-AR', { timeZone: ZONA_HORARIA_IANA })

// Solo se puede abrir si el alumno está asignado a un turno de este parcial, y dentro de su horario.
// Después pasa por: sin abrir → reglas del modo restringido → resolviendo en pantalla completa (con reloj) →
// entregado, salió con SALIR o Incidente (bloqueado hasta que el profesor lo reanude). El estado lo tiene el
// servidor: al recargar se retoma desde ahí, y una recarga durante el examen cuenta como salida del modo restringido.
export default function StudentExamPage() {
  const { id } = useParams()
  const alumno = getSession().username
  // Con ?clase=<id> (al entrar desde una clase), "Volver" lleva a esa clase.
  const [searchParams] = useSearchParams()
  const clase = getClase(searchParams.get('clase'))
  const [examen, setExamen] = useState(null) // { turno, documento, sesion, entrega }
  const [error, setError] = useState(null)
  // Se detectó una salida en esta página: el examen queda oculto aunque el servidor todavía no lo haya registrado.
  const [interrumpido, setInterrumpido] = useState(false)
  // La sesión en curso se abrió en esta página desde pantalla completa (reglas o "Volver al examen"). Si no, la
  // página se recargó o se abrió de nuevo durante el examen.
  const ingresoRef = useRef(false)

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

  // Eventos que quedaron sin mandar (sin conexión): se mandan al abrir y al volver la red.
  useEffect(() => {
    const sincronizar = () => sincronizarPendientes(alumno)
    sincronizar()
    window.addEventListener('online', sincronizar)
    return () => window.removeEventListener('online', sincronizar)
  }, [alumno])

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
  const conSesion = (nueva) => {
    ingresoRef.current = true
    setInterrumpido(false)
    setExamen((actual) => ({ ...actual, sesion: nueva }))
  }
  let content
  if (entrega) content = <SubmittedExam entrega={entrega} />
  else if (sesion && (interrumpido || sesion.estado === 'incidente' || (sesion.estado === 'en-curso' && sesion.reingresoPendiente))) {
    content = (
      <>
        <h1>{doc.titulo}</h1>
        <ExamenInterrumpido parcialId={doc.id} alumno={alumno} onReanudado={conSesion} onFinalizado={cargar} />
      </>
    )
  } else if (sesion?.estado === 'en-curso') {
    content = (
      <ExamInProgress
        key={`${sesion.id}:${sesion.reanudaciones}`}
        doc={doc}
        sesion={sesion}
        verificar={ingresoRef.current ? 'FULLSCREEN_EXIT' : 'PAGE_RELOAD'}
        onEntregado={(nueva) => setExamen((actual) => ({ ...actual, entrega: nueva }))}
        onCerrado={cargar}
        onInterrumpido={() => setInterrumpido(true)}
      />
    )
  } else if (sesion) {
    // Terminada (entregada o SALIR) pero la entrega todavía no llegó: se vuelve a pedir.
    content = <p className="muted" role="status">Cargando…</p>
  } else content = <ExamNotStarted doc={doc} turno={turno} onStarted={conSesion} />

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
  return (
    <>
      <h1>{doc.titulo}</h1>
      <ExamHeader tema={getTema(doc)} herramientas={getHerramientas(doc)} duracion={getDuracion(doc)} />
      <ReglasModoRestringido doc={doc} turno={turno} onStarted={onStarted} />
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
// SALIR reintenta sin conexión hasta este tiempo; después avisa y el examen sigue.
const ESPERA_SALIDA_MS = 3000

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

// Resolviendo en modo restringido. El contenido solo se ve en pantalla completa: ante cualquier salida (pantalla
// completa, pestaña, ventana, navegación o pérdida de señal) se oculta en el acto y se registra un Incidente.
// `verificar`: causa del incidente si al montar ya no está en pantalla completa.
function ExamInProgress({ doc, sesion, verificar, onEntregado, onCerrado, onInterrumpido }) {
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
  const [dialogo, setDialogo] = useState(null) // null | 'enviar' | 'salir'
  const [saliendo, setSaliendo] = useState(false)
  // Fuera de pantalla completa no se muestra nada del examen, ni siquiera un instante antes de detectarlo.
  const [oculto, setOculto] = useState(() => !enPantallaCompleta())
  const bloqueado = vencido || entrega !== null || saliendo || oculto
  const geogebraApis = useRef(new Map())
  const enviado = useRef(false)
  const idSalida = useRef(nuevoEventoId())
  const sesionKey = `${sesion.id}:${sesion.reanudaciones}`

  const respuestasFinalesRef = useRef(() => ({}))
  const onInterrumpidoRef = useRef(onInterrumpido)
  onInterrumpidoRef.current = onInterrumpido

  const guardRef = useRestrictedExamMode({
    sesionKey,
    verificar,
    // En el mismo evento del navegador: se oculta el examen.
    onIncidente: () => setOculto(true),
    // Un instante después (para juntar las señales de la misma salida): se registra con las últimas respuestas.
    onReportar: ({ causa, senales, urgente }) => {
      triggerExamIncident({
        parcialId: doc.id, alumno, sesionKey, causa, senales, urgente,
        respuestas: respuestasFinalesRef.current(), seq: seqRef.current + 1,
      })
      onInterrumpidoRef.current()
    },
  })

  // El servidor avisa que la sesión ya no está en curso (entregada, vencida o en Incidente): no se vigila más.
  const { respuestas, respRef, seqRef, cambiar, estado } = useAutosave({
    alumno, parcialId: doc.id, inicial, serverSeq: sesion.seq, bloqueado,
    onCerrado: () => {
      guardRef.current?.terminar()
      onCerrado()
    },
    onSinSenal: () => guardRef.current?.senal('CONNECTION_LOST'),
  })

  // Respuestas para mandar ya: lo escrito más el estado actual de cada GeoGebra.
  respuestasFinalesRef.current = () => {
    const finales = { ...respRef.current }
    for (const [blockId, api] of geogebraApis.current) {
      try {
        finales[blockId] = api.getBase64()
      } catch {
        // El applet ya no está (se desmontó): queda lo último guardado.
      }
    }
    return finales
  }

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

  // Manda la entrega. Antes marca la salida en curso (salir de pantalla completa después de entregar no es un
  // incidente) y sale de pantalla completa recién cuando el servidor confirmó. Automática: reintenta sin conexión
  // hasta que el servidor responda (que entrega lo último guardado si ya pasó la hora límite).
  const enviar = useCallback(async ({ automatico }) => {
    if (enviado.current) return
    const guard = guardRef.current
    if (guard && !guard.comenzarSalida()) return
    enviado.current = true
    setDialogo(null)
    setEntrega('enviando')
    setError('')
    const finales = respuestasFinalesRef.current()
    const desde = performance.now()
    for (;;) {
      try {
        const { entrega: nueva } = await request('POST', `/api/examen/${doc.id}/entregar`, { respuestas: finales, seq: seqRef.current + 1, automatico })
        guard?.terminar()
        borrarCache(alumno, doc.id)
        salirPantallaCompleta()
        onEntregado(nueva)
        window.scrollTo(0, 0)
        return
      } catch (e) {
        if (e.codigo === 'incidente' || e.codigo === 'reingreso') {
          guard?.terminar()
          onCerrado()
          return
        }
        if (!e.sinConexion || !automatico) {
          enviado.current = false
          setEntrega(null)
          setError(e.sinConexion
            ? 'Sin conexión: tus respuestas quedan guardadas en este dispositivo. Probá enviar de nuevo.'
            : `No se pudo enviar. ${e.message}`)
          guard?.cancelarSalida()
          return
        }
        if (performance.now() - desde > ESPERA_ENTREGA_MS) setEntrega('sin-conexion')
        await esperar(1000)
      }
    }
  }, [alumno, doc.id, onEntregado, onCerrado, guardRef, seqRef])

  // Se terminó el tiempo (o ya había terminado al abrir la página): se bloquea y se envía lo respondido.
  useEffect(() => {
    if (vencido && !oculto) enviar({ automatico: true })
  }, [vencido, oculto, enviar])

  // SALIR confirmado: 1) salida voluntaria en curso (las señales ya no son incidente), 2) se manda con las últimas
  // respuestas, 3) el servidor la registra con su hora y cambia el estado, 4) recién entonces se sale de pantalla
  // completa. Doble click o reintentos usan la misma clave: no hay dos entregas.
  async function handleSalir() {
    if (enviado.current) return
    const guard = guardRef.current
    if (!guard?.comenzarSalida()) return
    enviado.current = true
    setSaliendo(true)
    setError('')
    const body = { eventoId: idSalida.current, respuestas: respuestasFinalesRef.current(), seq: seqRef.current + 1, fechaCliente: Date.now() }
    const desde = performance.now()
    for (;;) {
      try {
        const { entrega: nueva } = await request('POST', `/api/examen/${doc.id}/salir`, body)
        guard.terminar()
        borrarCache(alumno, doc.id)
        setDialogo(null)
        salirPantallaCompleta()
        onEntregado(nueva)
        window.scrollTo(0, 0)
        return
      } catch (e) {
        if (['incidente', 'entregado', 'reingreso'].includes(e.codigo)) {
          guard.terminar()
          setDialogo(null)
          onCerrado()
          return
        }
        if (e.sinConexion && performance.now() - desde < ESPERA_SALIDA_MS) {
          await esperar(700)
          continue
        }
        enviado.current = false
        setSaliendo(false)
        setDialogo(null)
        setError(e.sinConexion
          ? 'Sin conexión: no se pudo registrar la salida. Tus respuestas siguen guardadas; probá de nuevo.'
          : `No se pudo salir. ${e.message}`)
        guard.cancelarSalida()
        return
      }
    }
  }

  if (oculto) {
    return (
      <>
        <h1>{doc.titulo}</h1>
        <ExamenInterrumpido parcialId={doc.id} alumno={alumno} onReanudado={() => onCerrado()} onFinalizado={onCerrado} />
      </>
    )
  }

  const sinResponder = blocks.filter((block) => isUnanswered(block, respuestas[block.id])).length

  return (
    <div className="exam-content">
      <h1>{doc.titulo}</h1>
      <ExamHeader
        tema={getTema(doc)}
        herramientas={getHerramientas(doc)}
        duracion={duracion}
        segundosRestantes={Math.ceil(restante / 1000)}
        respondidas={{ hechas: blocks.length - sinResponder, total: blocks.length }}
        estadoGuardado={bloqueado ? null : estado}
        sticky
        onSalir={() => setDialogo('salir')}
        salirDeshabilitado={bloqueado}
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
        <button type="button" onClick={() => setDialogo('enviar')} disabled={bloqueado}>
          {entrega === 'enviando' && !vencido ? 'Enviando…' : 'Enviar parcial'}
        </button>
        <span className="muted small">Tus respuestas se guardan solas mientras escribís.</span>
      </div>

      <ConfirmDialog
        abierto={dialogo === 'enviar'}
        titulo="¿Enviar el parcial?"
        confirmar="Enviar parcial"
        onConfirmar={() => enviar({ automatico: false })}
        onCancelar={() => setDialogo(null)}
      >
        <p>
          {sinResponder === 1 ? 'Tenés 1 apartado sin responder. ' : sinResponder > 1 ? `Tenés ${sinResponder} apartados sin responder. ` : ''}
          Una vez enviado no se puede modificar.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        abierto={dialogo === 'salir'}
        titulo="¿Seguro que querés salir del examen?"
        confirmar={saliendo ? 'Saliendo…' : 'Salir y entregar'}
        tono="danger"
        ocupado={saliendo}
        onConfirmar={handleSalir}
        onCancelar={() => setDialogo(null)}
      >
        <p>
          Si confirmás, el examen se entregará con todas las respuestas guardadas hasta este momento y no podrás volver
          a ingresar.
        </p>
      </ConfirmDialog>
    </div>
  )
}

function SubmittedExam({ entrega }) {
  const porVencimiento = entrega.enviadoPorTiempo || entrega.enviadoPorSistema
  let chip
  let texto
  if (entrega.salidaVoluntaria) {
    chip = <span className="chip exited">Salió y se entregó</span>
    texto = `Saliste del examen con SALIR el ${formatDate(entrega.fechaEntrega)}: se entregó con lo último guardado y ya no se puede retomar.`
  } else if (porVencimiento) {
    chip = <span className="chip published">Enviado por vencimiento</span>
    texto = `Enviado por vencimiento: se terminó el tiempo y tu parcial se entregó automáticamente con lo último guardado (${formatDate(entrega.fechaEntrega)}).`
  } else {
    chip = <span className="chip published">Entregado</span>
    texto = `Enviaste este parcial el ${formatDate(entrega.fechaEntrega)} · Ya no se puede modificar.`
  }

  return (
    <>
      <h1>{entrega.titulo}</h1>
      <div className="card notice">
        {chip}
        {texto}
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
