import { Link, useNavigate, useParams } from 'react-router-dom'
import NotFound from '../components/NotFound.jsx'
import TurnoForm from '../components/TurnoForm.jsx'
import { getTurno, hasStarted, updateTurno } from '../turnosStore.js'

export default function TurnoEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const turno = getTurno(id)

  if (!turno) return <NotFound title="Turno no encontrado" backTo="/turnos" backLabel="Volver a turnos" />

  if (hasStarted(turno)) {
    return (
      <>
        <h1>Editar turno</h1>
        <p className="muted">El turno ya comenzó: no se puede editar.</p>
        <p><Link to={`/turnos/${id}`}>Volver al turno</Link></p>
      </>
    )
  }

  function handleSubmit(values) {
    updateTurno(id, values)
    navigate(`/turnos/${id}`)
  }

  return (
    <>
      <h1>Editar turno</h1>
      <TurnoForm
        turnoId={id}
        initialValues={turno}
        onSubmit={handleSubmit}
        submitLabel="Guardar cambios"
        cancelTo={`/turnos/${id}`}
      />
    </>
  )
}
