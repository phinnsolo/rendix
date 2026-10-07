import { Link } from 'react-router-dom'

export default function NotFound({ title = 'Parcial no encontrado', backTo = '/documentos', backLabel = 'Volver a parciales' }) {
  return (
    <>
      <h1>{title}</h1>
      <p><Link to={backTo}>{backLabel}</Link></p>
    </>
  )
}
