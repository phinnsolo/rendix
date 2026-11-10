// Reglas de los turnos de un parcial (src/turnos.js).
//   npm test
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { validateHorario } from '../src/turnos.js'

describe('BUG-002 / BUG-003: el turno tiene que coincidir con el día y el turno de la clase', () => {
  const clase = { dia: 'lunes', turno: 'manana' }
  const antes = new Date('2026-10-01T12:00:00-03:00').getTime()

  test('lunes 26/10/2026 en el turno mañana: válido', () => {
    assert.deepEqual(validateHorario({ turno: 'manana', fecha: '2026-10-26', horaInicio: '08:00' }, 60, antes, clase), {})
  })

  test('turno noche para una clase de la mañana: error de turno (BUG-002)', () => {
    const errores = validateHorario({ turno: 'noche', fecha: '2026-10-26', horaInicio: '19:00' }, 60, antes, clase)
    assert.match(errores.turno, /turno mañana/)
  })

  test('martes para una clase de los lunes: error de fecha (BUG-003)', () => {
    const errores = validateHorario({ turno: 'manana', fecha: '2026-10-27', horaInicio: '08:00' }, 60, antes, clase)
    assert.match(errores.fecha, /lunes/)
  })

  test('el día sale de la fecha del calendario, no de la zona horaria del equipo', () => {
    // 2026-11-01 es domingo y 2026-11-02 es lunes en cualquier zona horaria.
    assert.ok(validateHorario({ turno: 'manana', fecha: '2026-11-01', horaInicio: '08:00' }, 60, antes, clase).fecha)
    assert.equal(validateHorario({ turno: 'manana', fecha: '2026-11-02', horaInicio: '08:00' }, 60, antes, clase).fecha, undefined)
  })

  test('sin clase, no se controla día ni turno (compatibilidad)', () => {
    assert.deepEqual(validateHorario({ turno: 'noche', fecha: '2026-10-27', horaInicio: '19:00' }, 60, antes), {})
  })
})
