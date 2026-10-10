import { useNavigate, useParams } from 'react-router-dom'
import ClaseForm from '../components/ClaseForm.jsx'
import NotFound from '../components/NotFound.jsx'
import { getClase, updateClase } from '../clasesStore.js'

export default function ClaseEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const clase = getClase(id)

  if (!clase) return <NotFound title="Clase no encontrada" backTo="/dev" backLabel="Volver a clases" />

  function handleSubmit(values) {
    updateClase(id, values)
    navigate(`/dev/clases/${id}`)
  }

  return (
    <>
      <h1>Editar clase</h1>
      <ClaseForm initialValues={clase} onSubmit={handleSubmit} submitLabel="Guardar cambios" cancelTo={`/dev/clases/${id}`} />
    </>
  )
}
