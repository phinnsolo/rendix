// La migración del Sprint 4 se aplica sobre una base con datos (esquema anterior) sin perder nada, y es idempotente.
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { aplicarMigraciones } from '../server/migraciones.js'

test('migración sobre datos existentes: conserva sesiones, respuestas y entregas', async () => {
  const db = await PGlite.create()
  const ejecutar = async (sql) => (await db.exec(sql)).at(-1)
  await db.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'))
  await db.exec(`
    insert into usuarios (username, nombre, rol, password_hash) values ('p', 'Prof', 'profesor', 'x'), ('a', 'Alu', 'alumno', 'x');
    insert into documentos (id, profesor, titulo) values ('d1', 'p', 'Parcial viejo');
    insert into turnos (id, profesor, parcial_id, fecha, hora_inicio, hora_fin, inicio, fin, alumnos)
      values ('t1', 'p', 'd1', '2026-01-01', '08:00', '09:00', now() - interval '1 day', now() - interval '23 hours', '{a}');
    insert into sesiones_examen (turno_id, alumno, parcial_id, deadline, respuestas, seq, estado)
      values ('t1', 'a', 'd1', now() - interval '23 hours', '{"b1": "respuesta vieja"}', 7, 'entregado-sistema');
    insert into entregas (id, parcial_id, profesor, alumno, alumno_nombre, titulo, respuestas) values ('e1', 'd1', 'p', 'a', 'Alu', 'Parcial viejo', '{"b1": "respuesta vieja"}');
  `)

  assert.deepEqual(await aplicarMigraciones(ejecutar), ['001_modo_restringido.sql'])
  assert.deepEqual(await aplicarMigraciones(ejecutar), []) // ya aplicada: no se repite

  const { rows: [s] } = await db.query("select * from sesiones_examen where turno_id = 't1'")
  assert.equal(s.estado, 'entregado-sistema')
  assert.deepEqual(s.respuestas, { b1: 'respuesta vieja' })
  assert.equal(Number(s.seq), 7)
  assert.ok(s.id) // las sesiones existentes reciben su id
  assert.equal(s.reingreso_pendiente, false)
  assert.equal(s.reanudaciones, 0)
  const { rows: [e] } = await db.query("select * from entregas where id = 'e1'")
  assert.equal(e.salida_voluntaria, false)
  // El nuevo estado ya es válido; uno inventado no.
  await db.exec("update sesiones_examen set estado = 'incidente' where turno_id = 't1'")
  await assert.rejects(db.exec("update sesiones_examen set estado = 'reanudado' where turno_id = 't1'"))
  // Correr el SQL de nuevo a mano tampoco rompe nada (es idempotente).
  await db.exec(await readFile(new URL('../db/migrations/001_modo_restringido.sql', import.meta.url), 'utf8'))
  await db.close()
})
