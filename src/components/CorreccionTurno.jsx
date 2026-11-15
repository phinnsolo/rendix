import { useState } from 'react'
import { Link } from 'react-router-dom'
import { nombreDe } from '../auth.js'
import { ESTADO_CORRECCION } from '../correccion.js'
import { estadoAlumno } from '../seguimiento.js'
import { getCorreccionTurno, publicarTurno } from '../submissionsStore.js'
import { usePolling } from '../usePolling.js'
import { EstadoChip } from './AlumnoActividad.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { AlertasChips } from './RevisionEntrega.jsx'

const ACTUALIZACION_MS = 4000
const pts = (n) => (n == null ? '—' : String(n).replace('.', ','))

// Corrección de un turno (RF11/RF12): progreso de los agentes jueces por alumno, nota, alertas y publicación masiva
// de las entregas listas. Muestra también a quien no inició o no completó el examen.
export default function CorreccionTurno({ turno, estadoDelTurno }) {
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [informe, setInforme] = useState(null)

  async function cargar() {
    try {
      const { alumnos } = await getCorreccionTurno(turno.id)
      setFilas(alumnos)
      setError('')
    } catch (e) {
      setError(e.sinConexion ? 'Sin conexión con el servidor: la corrección no se está actualizando.' : e.message)
    }
  }
  usePolling(cargar, ACTUALIZACION_MS, { clave: turno.id })

  if (!filas) return error ? <p className="error small">{error}</p> : null
  const conEntrega = filas.filter((f) => f.correccion)
  if (conEntrega.length === 0) return null

  const listas = conEntrega.filter((f) => f.correccion.estado !== 'publicado' && f.correccion.resumen?.sinPuntaje === 0)
  const publicadas = conEntrega.filter((f) => f.correccion.estado === 'publicado').length
  const evaluadas = conEntrega.filter((f) => ['evaluado', 'publicado'].includes(f.correccion.estado)).length
  const ordenadas = [...filas].sort((a, b) => nombreDe(a.username).localeCompare(nombreDe(b.username), 'es', { numeric: true }))

  async function publicar() {
    setOcupado(true)
    try {
      setInforme(await publicarTurno(turno.id))
      setConfirmar(false)
      cargar()
    } catch (e) {
      setInforme({ error: e.sinConexion ? 'Sin conexión con el servidor. Probá de nuevo.' : e.message })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="submissions" aria-label="Corrección y notas">
      <div className="tracking-header">
        <h2>Corrección y notas</h2>
        <p className="muted small">
          Evaluadas <strong>{evaluadas}</strong> de {conEntrega.length} entregas · Publicadas <strong>{publicadas}</strong>
        </p>
        <button type="button" onClick={() => { setInforme(null); setConfirmar(true) }} disabled={listas.length === 0 || ocupado}>
          Publicar notas listas{listas.length > 0 && ` (${listas.length})`}
        </button>
      </div>
      {error && <p className="error small" role="status">{error}</p>}
      {informe && <InformePublicacion informe={informe} />}
      <div className="table-scroll">
        <table className="tracking-table">
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Examen</th>
              <th>Corrección</th>
              <th>Nota</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f) => {
              const c = f.correccion
              const estado = c ? ESTADO_CORRECCION[c.estado] : null
              return (
                <tr key={f.username}>
                  <td className="tracking-name">
                    {nombreDe(f.username)}
                    <span className="muted small table-sub">{f.username}</span>
                  </td>
                  <td><EstadoChip estado={estadoAlumno(f, estadoDelTurno)} /></td>
                  <td>
                    {c ? (
                      <>
                        <span className={estado.className}>{estado.label}</span>
                        {c.estado !== 'publicado' && <AlertasChips resumen={c.resumen} />}
                      </>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="monitor-num">{c?.nota != null ? `${pts(c.nota)} / 10` : '—'}</td>
                  <td className="table-actions">
                    {f.entrega && (
                      <Link to={`/documentos/${turno.parcialId}/entregas/${f.entrega.id}`} className={c?.estado === 'publicado' ? 'button secondary' : 'button'}>
                        {c?.estado === 'publicado' ? 'Ver corrección' : 'Revisar'}
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        abierto={confirmar}
        titulo={`¿Publicar ${listas.length === 1 ? '1 nota' : `${listas.length} notas`}?`}
        confirmar={ocupado ? 'Publicando…' : 'Publicar'}
        ocupado={ocupado}
        onConfirmar={publicar}
        onCancelar={() => setConfirmar(false)}
      >
        <p>Se publican las entregas con todas las preguntas calificadas: {listas.map((f) => nombreDe(f.username)).join(', ')}.</p>
        <p>Las que tienen preguntas sin puntaje quedan pendientes. Los alumnos ven su nota y el feedback en cuanto se publica.</p>
      </ConfirmDialog>
    </section>
  )
}

function InformePublicacion({ informe }) {
  if (informe.error) return <p className="error" role="alert">{informe.error}</p>
  return (
    <div className="card notice informe-publicacion" role="status">
      <p>
        <span className="chip published">Publicadas: {informe.publicadas.length}</span>{' '}
        {informe.publicadas.map((p) => p.alumnoNombre).join(', ')}
      </p>
      {informe.pendientes.length > 0 && (
        <ul className="small">
          {informe.pendientes.map((p) => <li key={p.entregaId}><strong>{p.alumnoNombre}</strong> quedó pendiente: {p.motivo}</li>)}
        </ul>
      )}
    </div>
  )
}
