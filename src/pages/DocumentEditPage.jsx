import { useNavigate, useParams } from 'react-router-dom'
import DocumentForm from '../components/DocumentForm.jsx'
import NotFound from '../components/NotFound.jsx'
import { getDocument, updateDocument } from '../documentsStore.js'
import { getTurnosFor } from '../turnosStore.js'

export default function DocumentEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const doc = getDocument(id)

  if (!doc) return <NotFound />

  async function handleSubmit(values) {
    await updateDocument(id, values)
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
