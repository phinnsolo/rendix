// Configuración compartida por el frontend y la API. Las cuentas predefinidas se cargan en la base con
// scripts/seed.js (scripts/seed-data.js): ya no viajan en el código del navegador.

// Zona horaria fija de la app: la fecha y la hora de los turnos se interpretan en hora argentina (sin horario
// de verano), así el servidor y todos los dispositivos calculan el mismo instante.
export const ZONA_HORARIA = '-03:00'
export const ZONA_HORARIA_IANA = 'America/Argentina/Buenos_Aires'

// Temas de examen disponibles. Para agregar o quitar temas, editar esta lista.
export const TEMAS = ['Tema 1', 'Tema 2', 'Tema 3']

// Largo máximo del título de un parcial, en caracteres.
export const TITULO_MAXIMO = 100

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

// Clases predefinidas: el seed las carga en la base. Cada clase se dicta siempre el mismo día y turno.
// El dev las puede editar desde la app como cualquier otra.
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
