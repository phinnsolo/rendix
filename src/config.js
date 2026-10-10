// Credenciales predefinidas — TEMPORAL, solo para Semana 1.
// No es seguro: todo el código del frontend es visible para cualquiera.
// Se reemplazará por autenticación real cuando haya backend.
export const PROFESORES = [
  { username: 'profesor1', password: 'rendix123', nombre: 'Profesor Demo 1', rol: 'profesor' },
  { username: 'profesor2', password: 'rendix123', nombre: 'Profesor Demo 2', rol: 'profesor' },
  { username: 'profesor3', password: 'rendix123', nombre: 'Profesor Demo 3', rol: 'profesor' },
]

// Desarrolladores: crean las clases y les asignan profesores y alumnos.
export const DEVS = [
  { username: 'dev1', password: 'rendix123', nombre: 'Dev Demo', rol: 'dev' },
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

// Turnos fijos en los que se puede tomar un parcial. El profesor elige uno y la hora de inicio dentro
// de su franja; el parcial termina a la hora de inicio + la duración, sin pasarse del fin del turno.
export const TURNOS = {
  manana: { nombre: 'Turno mañana', inicio: '07:45', fin: '11:45' },
  tarde: { nombre: 'Turno tarde', inicio: '13:30', fin: '17:30' },
  noche: { nombre: 'Turno noche', inicio: '18:30', fin: '22:30' },
}

// Herramientas que el profesor puede habilitar para el alumno durante el examen.
// Son recursos generales del examen, distintos de los apartados GeoGebra dentro de una consigna.
export const HERRAMIENTAS = {
  calculadora: 'Calculadora',
  geogebra: 'GeoGebra',
}

// Días de la semana en que puede dictarse una clase.
export const DIAS = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
}

// Clases predefinidas (no se editan desde la app). Cada clase se dicta siempre el mismo día y turno.
// Las que crea el dev se guardan aparte, en clasesStore.js.
export const CLASES = [
  {
    id: 'matematicas',
    nombre: 'Matemáticas',
    dia: 'lunes',
    turno: 'manana',
    profesores: ['profesor1'],
    alumnos: ['alumno1', 'alumno2', 'alumno3', 'alumno4', 'alumno5'],
  },
  {
    id: 'fisica',
    nombre: 'Física',
    dia: 'miercoles',
    turno: 'tarde',
    profesores: ['profesor2'],
    alumnos: ['alumno4', 'alumno5', 'alumno6', 'alumno7', 'alumno8'],
  },
]
