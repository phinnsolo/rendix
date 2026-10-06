// Credenciales predefinidas — TEMPORAL, solo para Semana 1.
// No es seguro: todo el código del frontend es visible para cualquiera.
// Se reemplazará por autenticación real cuando haya backend.
export const PROFESORES = [
  { username: 'profesor1', password: 'rendix123', nombre: 'Profesor Demo 1' },
  { username: 'profesor2', password: 'rendix123', nombre: 'Profesor Demo 2' },
  { username: 'profesor3', password: 'rendix123', nombre: 'Profesor Demo 3' },
]

// Temas de examen disponibles. Para agregar o quitar temas, editar esta lista.
export const TEMAS = ['Tema 1', 'Tema 2', 'Tema 3']

// Herramientas que el profesor puede habilitar para el alumno durante el examen.
// Son recursos generales del examen, distintos de los apartados GeoGebra dentro de una consigna.
export const HERRAMIENTAS = {
  calculadora: 'Calculadora',
  geogebra: 'GeoGebra',
}
