// Cuentas de prueba que carga scripts/seed.js. Las contraseñas se guardan hasheadas en la base.
export const PROFESORES = [
  { username: 'profesor1', password: 'rendix123', nombre: 'Profesor Demo 1', rol: 'profesor' },
  { username: 'profesor2', password: 'rendix123', nombre: 'Profesor Demo 2', rol: 'profesor' },
  { username: 'profesor3', password: 'rendix123', nombre: 'Profesor Demo 3', rol: 'profesor' },
]

// Desarrolladores: crean las clases y les asignan profesores y alumnos.
export const DEVS = [
  { username: 'dev1', password: 'rendix123', nombre: 'Dev Demo', rol: 'dev' },
]

export const ALUMNOS = Array.from({ length: 10 }, (_, i) => ({
  username: `alumno${i + 1}`,
  password: 'rendix123',
  nombre: `Alumno Demo ${i + 1}`,
  rol: 'alumno',
}))
