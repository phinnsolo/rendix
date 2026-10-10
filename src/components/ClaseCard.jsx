import { Link } from 'react-router-dom'
import { nombreDe } from '../auth.js'
import { DIAS, TURNOS } from '../config.js'
import { alumnosLabel } from '../turnosStore.js'

// "Cuadrito" de una clase: nombre, día, turno, profesores y cantidad de alumnos.
// Con `to`, la tarjeta entera es un link.
export function ClaseCard({ clase, to }) {
  const turno = TURNOS[clase.turno]
  const contenido = (
    <>
      <span className="clase-nombre">{clase.nombre}</span>
      <span className="clase-horario">
        {DIAS[clase.dia]} · {turno.nombre}
        <span className="muted"> ({turno.inicio} a {turno.fin})</span>
      </span>
      <span className="muted small">
        {clase.profesores.length === 1 ? 'Profesor' : 'Profesores'}: {clase.profesores.map(nombreDe).join(', ')}
      </span>
      <span className="muted small">{alumnosLabel(clase.alumnos.length)}</span>
    </>
  )
  return (
    <li>
      {to ? <Link to={to} className="card clase-card">{contenido}</Link> : <div className="card clase-card">{contenido}</div>}
    </li>
  )
}

// Grilla de clases. `linkTo(clase)` devuelve el destino de cada tarjeta, si lo tiene.
export default function ClasesGrid({ clases, linkTo, vacio = 'Todavía no tenés clases asignadas.' }) {
  if (clases.length === 0) return <p className="muted">{vacio}</p>
  return (
    <ul className="clases-grid">
      {clases.map((clase) => (
        <ClaseCard key={clase.id} clase={clase} to={linkTo?.(clase)} />
      ))}
    </ul>
  )
}
