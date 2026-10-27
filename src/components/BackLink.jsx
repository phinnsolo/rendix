import { Link } from 'react-router-dom'

// Link para volver a la página anterior: una pestañita con flecha arriba del título.
export default function BackLink({ to, children }) {
  return (
    <Link to={to} className="back-link">
      <svg viewBox="0 0 16 16" aria-hidden="true" className="back-link-arrow">
        <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  )
}
