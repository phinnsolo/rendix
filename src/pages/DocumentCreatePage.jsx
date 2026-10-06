import { useNavigate } from 'react-router-dom'
import DocumentForm from '../components/DocumentForm.jsx'
import { createDocument } from '../documentsStore.js'

export default function DocumentCreatePage() {
  const navigate = useNavigate()

  function handleSubmit(values) {
    const doc = createDocument(values)
    navigate(`/documentos/${doc.id}`)
  }

  return (
    <>
      <h1>Nuevo documento</h1>
      <DocumentForm onSubmit={handleSubmit} submitLabel="Crear" cancelTo="/documentos" />
    </>
  )
}
