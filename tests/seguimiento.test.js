// Estado de cada alumno en el tablero del profesor (src/seguimiento.js).
//   npm test
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTADO_ALUMNO, estadoAlumno } from '../src/seguimiento.js'

describe('BUG-005: quien abrió y no envió no figura como "Entregado"', () => {
  test('entrega automática al llegar a cero (pestaña abierta): Entregado por sistema', () => {
    const estado = estadoAlumno({ sesion: { estado: 'entregado' }, entrega: { enviadoPorTiempo: true } }, 'finalizado')
    assert.equal(estado, 'entregado-sistema')
    assert.equal(ESTADO_ALUMNO[estado].label, 'Entregado por sistema')
  })

  test('sesión cerrada por el servidor al vencer (pestaña cerrada): Entregado por sistema', () => {
    assert.equal(estadoAlumno({ sesion: { estado: 'entregado-sistema' }, entrega: { enviadoPorSistema: true } }, 'finalizado'), 'entregado-sistema')
    assert.equal(estadoAlumno({ sesion: { estado: 'entregado-sistema' }, entrega: null }, 'finalizado'), 'entregado-sistema')
  })

  test('envío con el botón: Entregado', () => {
    assert.equal(estadoAlumno({ sesion: { estado: 'entregado' }, entrega: {} }, 'en-curso'), 'entregado')
  })

  test('SALIR sigue siendo "Salió y se entregó"', () => {
    assert.equal(estadoAlumno({ sesion: { estado: 'salio-entrego' }, entrega: { salidaVoluntaria: true, enviadoPorSistema: true } }, 'finalizado'), 'salio-entrego')
  })
})
