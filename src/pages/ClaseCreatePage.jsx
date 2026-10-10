import { useNavigate } from 'react-router-dom'
import ClaseForm from '../components/ClaseForm.jsx'
import { createClase } from '../clasesStore.js'

export default function ClaseCreatePage() {
  const navigate = useNavigate()

  function handleSubmit(values) {
    const clase = createClase(values)
    navigate(`/dev/clases/${clase.id}`)
  }

  return (
    <>
      <h1>Nueva clase</h1>
      <ClaseForm onSubmit={handleSubmit} submitLabel="Crear clase" cancelTo="/dev" />
    </>
  )
}
