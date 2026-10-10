import { useNavigate, useParams } from 'react-router-dom'
import DocumentForm from '../components/DocumentForm.jsx'
import NotFound from '../components/NotFound.jsx'
import { getClase } from '../clasesStore.js'
import { getDocument, updateDocument } from '../documentsStore.js'
import { getTurnosFor, syncHorarios } from '../turnosStore.js'

export default function DocumentEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const doc = getDocument(id)

  if (!doc) return <NotFound />

  function handleSubmit({ horarios, ...values }) {
    updateDocument(id, values)
    syncHorarios(id, horarios, values.duracion, getClase(values.claseId)?.alumnos)
    navigate(`/documentos/${id}`)
  }

  return (
    <>
      <h1>Editar parcial</h1>
      <DocumentForm
        initialValues={doc}
        initialHorarios={getTurnosFor(id)}
        onSubmit={handleSubmit}
        submitLabel="Guardar cambios"
        cancelTo={`/documentos/${id}`}
      />
    </>
  )
}
