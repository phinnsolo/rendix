import { useNavigate } from 'react-router-dom'
import DocumentForm from '../components/DocumentForm.jsx'
import { createDocument } from '../documentsStore.js'
import { syncHorarios } from '../turnosStore.js'

export default function DocumentCreatePage() {
  const navigate = useNavigate()

  function handleSubmit({ horarios, ...values }) {
    const doc = createDocument(values)
    syncHorarios(doc.id, horarios, values.duracion)
    navigate(`/documentos/${doc.id}`)
  }

  return (
    <>
      <h1>Nuevo parcial</h1>
      <DocumentForm onSubmit={handleSubmit} submitLabel="Crear" cancelTo="/documentos" />
    </>
  )
}
