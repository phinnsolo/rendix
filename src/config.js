// Credenciales predefinidas — TEMPORAL, solo para Semana 1.
// No es seguro: todo el código del frontend es visible para cualquiera.
// Se reemplazará por autenticación real cuando haya backend.
export const PROFESORES = [
  { username: 'profesor1', password: 'rendix123', nombre: 'Profesor Demo 1', rol: 'profesor' },
  { username: 'profesor2', password: 'rendix123', nombre: 'Profesor Demo 2', rol: 'profesor' },
  { username: 'profesor3', password: 'rendix123', nombre: 'Profesor Demo 3', rol: 'profesor' },
]

// Alumnos registrados. Qué parciales ve cada uno lo deciden los turnos a los que lo asigna un profesor.
export const ALUMNOS = Array.from({ length: 10 }, (_, i) => ({
  username: `alumno${i + 1}`,
  password: 'rendix123',
  nombre: `Alumno Demo ${i + 1}`,
  rol: 'alumno',
}))

// Temas de examen disponibles. Para agregar o quitar temas, editar esta lista.
export const TEMAS = ['Tema 1', 'Tema 2', 'Tema 3']

// Duración del parcial en minutos (la elige el profesor al crearlo).
export const DURACION_MAXIMA = 120
export const DURACION_POR_DEFECTO = 60

// Herramientas que el profesor puede habilitar para el alumno durante el examen.
// Son recursos generales del examen, distintos de los apartados GeoGebra dentro de una consigna.
export const HERRAMIENTAS = {
  calculadora: 'Calculadora',
  geogebra: 'GeoGebra',
}
