import { useNavigate, useSearchParams } from 'react-router-dom'
import TurnoForm from '../components/TurnoForm.jsx'
import { createTurno } from '../turnosStore.js'

export default function TurnoCreatePage() {
  const navigate = useNavigate()
  // Desde el detalle de un parcial publicado se llega con el examen ya elegido.
  const [searchParams] = useSearchParams()

  function handleSubmit(values) {
    const turno = createTurno(values)
    navigate(`/turnos/${turno.id}`)
  }

  return (
    <>
      <h1>Nuevo turno</h1>
      <TurnoForm
        initialValues={{ parcialId: searchParams.get('parcial') ?? '' }}
        onSubmit={handleSubmit}
        submitLabel="Crear"
        cancelTo="/turnos"
      />
    </>
  )
}
