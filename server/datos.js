// Acceso a las tablas: convierte filas a los objetos que usa el frontend (camelCase, fechas ISO) y guarda los
// cambios de turnos y entregas. Las reglas de negocio vienen de src/ (turnos.js, clases.js, ...).

import { blocksParaAlumno } from '../src/documentBlocks.js'
import { turnoFin, turnoInicio } from '../src/turnos.js'

// Margen después de la hora límite para aceptar el último guardado o la entrega (demora de la red).
export const TOLERANCIA_MS = 5000

const iso = (fecha) => (fecha ? new Date(fecha).toISOString() : null)

export function aUsuario(r) {
  return { username: r.username, nombre: r.nombre, rol: r.rol, ...(r.email ? { email: r.email } : {}) }
}

export function aClase(r) {
  return {
    id: r.id,
    nombre: r.nombre,
    dia: r.dia,
    turno: r.turno,
    profesores: r.profesores,
    alumnos: r.alumnos,
    predefinida: r.predefinida,
    fechaCreacion: iso(r.fecha_creacion),
    fechaModificacion: iso(r.fecha_modificacion),
  }
}

export function aDocumento(r, { paraAlumno = false } = {}) {
  return {
    id: r.id,
    profesor: r.profesor,
    claseId: r.clase_id,
    estado: r.estado,
    titulo: r.titulo,
    tema: r.tema,
    herramientas: r.herramientas,
    duracion: r.duracion,
    bloques: paraAlumno ? blocksParaAlumno(r.bloques) : r.bloques,
    contenido: r.contenido,
    fechaCreacion: iso(r.fecha_creacion),
    fechaModificacion: iso(r.fecha_modificacion),
    fechaPublicacion: iso(r.fecha_publicacion),
  }
}

// `aperturas` es { alumno: ISO } con los que ya abrieron el parcial en este turno.
export function aTurno(r, aperturas = {}) {
  return {
    id: r.id,
    profesor: r.profesor,
    parcialId: r.parcial_id,
    turno: r.turno,
    nombre: r.nombre,
    fecha: r.fecha,
    horaInicio: r.hora_inicio,
    horaFin: r.hora_fin,
    alumnos: r.alumnos,
    aperturas,
    fechaCreacion: iso(r.fecha_creacion),
  }
}

export function aEntrega(r, { paraAlumno = false } = {}) {
  return {
    id: r.id,
    parcialId: r.parcial_id,
    profesor: r.profesor,
    alumno: r.alumno,
    alumnoNombre: r.alumno_nombre,
    titulo: r.titulo,
    tema: r.tema,
    herramientas: r.herramientas,
    duracion: r.duracion,
    bloques: paraAlumno ? blocksParaAlumno(r.bloques) : r.bloques,
    respuestas: r.respuestas,
    fechaInicio: iso(r.fecha_inicio),
    fechaEntrega: iso(r.fecha_entrega),
    enviadoPorTiempo: r.enviado_por_tiempo,
    enviadoPorSistema: r.enviado_por_sistema,
    correccion: r.correccion,
  }
}

export function aSesion(r) {
  return {
    turnoId: r.turno_id,
    alumno: r.alumno,
    apertura: iso(r.apertura),
    deadline: iso(r.deadline),
    respuestas: r.respuestas,
    seq: Number(r.seq),
    ultimoGuardado: iso(r.ultimo_guardado),
    ultimoLatido: iso(r.ultimo_latido),
    pendientes: r.pendientes,
    estado: r.estado,
  }
}

// --- Turnos

// Turnos de un profesor bloqueados hasta el fin de la transacción, para aplicarles un cambio.
export async function turnosParaCambiar(client, profesor) {
  const { rows } = await client.query('select * from turnos where profesor = $1 order by inicio for update', [profesor])
  return rows.map((r) => aTurno(r))
}

const CAMPOS_TURNO = (t) => JSON.stringify([t.turno, t.nombre, t.fecha, t.horaInicio, t.horaFin, t.alumnos])

// Guarda la diferencia entre la lista de turnos `antes` y `despues` de un profesor.
export async function guardarTurnos(client, antes, despues) {
  const previos = new Map(antes.map((t) => [t.id, t]))
  for (const t of despues) {
    const previo = previos.get(t.id)
    if (previo && CAMPOS_TURNO(previo) === CAMPOS_TURNO(t)) continue
    const valores = [t.id, t.profesor, t.parcialId, t.turno, t.nombre ?? null, t.fecha, t.horaInicio, t.horaFin, turnoInicio(t), turnoFin(t), t.alumnos]
    if (previo) {
      await client.query(
        `update turnos set turno = $4, nombre = $5, fecha = $6, hora_inicio = $7, hora_fin = $8, inicio = $9, fin = $10, alumnos = $11
         where id = $1 and profesor = $2 and parcial_id = $3`,
        valores
      )
    } else {
      await client.query(
        `insert into turnos (id, profesor, parcial_id, turno, nombre, fecha, hora_inicio, hora_fin, inicio, fin, alumnos)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        valores
      )
    }
  }
  const quedan = new Set(despues.map((t) => t.id))
  const borrados = antes.filter((t) => !quedan.has(t.id)).map((t) => t.id)
  if (borrados.length > 0) await client.query('delete from turnos where id = any($1)', [borrados])
}

// { turnoId: { alumno: ISO } } con las aperturas de los turnos pedidos (de un solo alumno si se indica).
export async function aperturasDe(client, turnoIds, alumno = null) {
  if (turnoIds.length === 0) return {}
  const { rows } = await client.query(
    'select turno_id, alumno, apertura from sesiones_examen where turno_id = any($1) and ($2::text is null or alumno = $2)',
    [turnoIds, alumno]
  )
  const porTurno = {}
  for (const r of rows) (porTurno[r.turno_id] ??= {})[r.alumno] = iso(r.apertura)
  return porTurno
}

// --- Entregas

// Crea la entrega de una sesión con una copia del parcial. Si ya existía, no hace nada.
export async function crearEntrega(client, sesion, { respuestas, porTiempo, porSistema, fechaEntrega }) {
  await client.query(
    `insert into entregas (id, parcial_id, profesor, alumno, alumno_nombre, titulo, tema, herramientas, duracion, bloques,
                           respuestas, fecha_inicio, fecha_entrega, enviado_por_tiempo, enviado_por_sistema)
     select $1, d.id, d.profesor, u.username, u.nombre, d.titulo, d.tema, d.herramientas, d.duracion, d.bloques, $2, $3, $4, $5, $6
     from documentos d, usuarios u where d.id = $7 and u.username = $8
     on conflict (parcial_id, alumno) do nothing`,
    [crypto.randomUUID(), JSON.stringify(respuestas), sesion.apertura, fechaEntrega, porTiempo, porSistema, sesion.parcial_id, sesion.alumno]
  )
}

// Entrega automática del servidor: las sesiones que pasaron la hora límite (más la tolerancia) sin entregarse
// se entregan con lo último guardado, con la hora límite como fecha de entrega. `filtro` es una condición SQL
// sobre `s` (sesiones_examen) con el parámetro $1.
// Se llama antes de leer sesiones o entregas, así nadie ve una sesión vencida como "en curso".
export async function finalizarVencidas(client, filtro, valor) {
  const { rows } = await client.query(
    `select s.* from sesiones_examen s
     where s.estado = 'en-curso' and s.deadline < $2 and ${filtro}
     for update skip locked`,
    [valor, new Date(Date.now() - TOLERANCIA_MS)]
  )
  for (const s of rows) {
    await crearEntrega(client, s, { respuestas: s.respuestas, porTiempo: false, porSistema: true, fechaEntrega: s.deadline })
    await client.query(
      "update sesiones_examen set estado = 'entregado-sistema' where turno_id = $1 and alumno = $2",
      [s.turno_id, s.alumno]
    )
  }
}
