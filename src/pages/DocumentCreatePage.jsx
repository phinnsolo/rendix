import { useNavigate, useSearchParams } from 'react-router-dom'
import DocumentForm from '../components/DocumentForm.jsx'
import { createDocument } from '../documentsStore.js'

// Con ?clase=<id> (al entrar desde una clase), la clase viene elegida y Cancelar vuelve a ella.
export default function DocumentCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const claseId = searchParams.get('clase') ?? ''

  async function handleSubmit(values) {
    const doc = await createDocument(values)
    navigate(`/documentos/${doc.id}`)
  }

  return (
    <>
      <h1>Nuevo parcial</h1>
      <DocumentForm
        claseId={claseId}
        onSubmit={handleSubmit}
        submitLabel="Crear"
        cancelTo={claseId ? `/clases/${claseId}` : '/documentos'}
      />
    </>
  )
}
