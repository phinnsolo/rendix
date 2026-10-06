import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <>
      <h1>Documento no encontrado</h1>
      <p><Link to="/documentos">Volver a documentos</Link></p>
    </>
  )
}
