import BackLink from './BackLink.jsx'

export default function NotFound({ title = 'Parcial no encontrado', backTo = '/documentos', backLabel = 'Volver a parciales' }) {
  return (
    <>
      <h1>{title}</h1>
      <BackLink to={backTo}>{backLabel}</BackLink>
    </>
  )
}
