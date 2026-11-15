// Corrección automática (Sprint final): puntajes y criterios de cada apartado, validación del resultado de un
// agente juez, cálculo de la nota y estados. Lo comparten el servidor (que es el único que corrige y publica) y el
// frontend (que lo muestra), como estadoExamen.js.
//
// Cada apartado del parcial puede tener, además de su consigna:
//   puntaje:   puntaje máximo de la pregunta (su peso en la nota). Si no tiene, vale 1 (parciales anteriores).
//   criterios: [{ id, texto, peso }] criterios de corrección con su peso relativo dentro de la pregunta.
// La nota final (0 a 10, la escala del proyecto) es la suma de los puntajes definitivos sobre la suma de los máximos.

export const PUNTAJE_MAXIMO = 100
export const CRITERIOS_MAXIMOS = 10
export const CRITERIO_TEXTO_MAXIMO = 300
export const FEEDBACK_MAXIMO = 2000
export const UMBRAL_POR_DEFECTO = 0.7
// Intentos de un juez por pregunta: el primero y hasta 2 reintentos automáticos.
export const INTENTOS_MAXIMOS = 3

// Criterio implícito para los apartados sin criterios propios (parciales creados antes de este sprint).
export const CRITERIO_GENERAL = { id: 'general', texto: 'La respuesta es correcta y completa según la consigna.', peso: 1 }

export const redondear = (n) => Math.round(n * 100) / 100

export const puntajeDe = (block) => (typeof block?.puntaje === 'number' ? block.puntaje : 1)

export function criteriosDe(block) {
  return Array.isArray(block?.criterios) && block.criterios.length > 0 ? block.criterios : [CRITERIO_GENERAL]
}

// Cómo se corrige cada tipo: texto y código con un agente juez de IA; multiple choice comparando con la opción
// correcta (determinístico, no hace falta un modelo); GeoGebra a mano (la construcción es un archivo binario que el
// juez no puede leer).
export function modoEvaluacion(block) {
  if (block.tipo === 'opcion-multiple') return 'automatica'
  if (block.tipo === 'geogebra') return 'manual'
  return 'ia'
}

// La respuesta está vacía o no cambió el punto de partida (código inicial, construcción inicial).
export function respuestaVacia(block, valor) {
  if (valor == null) return true
  if (block.tipo === 'opcion-multiple') return !block.opciones.some((o) => o.id === valor)
  if (block.tipo === 'geogebra') return typeof valor !== 'string' || !valor || valor === block.ggbBase64
  if (typeof valor !== 'string' || !valor.trim()) return true
  if (block.tipo === 'codigo') return valor.trim() === String(block.contenido ?? '').trim()
  return false
}

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v)
const dosDecimales = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9

// Error en el puntaje y los criterios de un apartado (texto para el profesor), o null.
export function validarCorreccionBloque(block, index) {
  const nombre = `El apartado ${index + 1}`
  if (block.puntaje !== undefined) {
    if (!esNumero(block.puntaje) || block.puntaje <= 0 || block.puntaje > PUNTAJE_MAXIMO || !dosDecimales(block.puntaje)) {
      return `${nombre} necesita un puntaje entre 0,01 y ${PUNTAJE_MAXIMO}.`
    }
  }
  if (block.criterios === undefined) return null
  if (!Array.isArray(block.criterios)) return `${nombre} tiene criterios de corrección inválidos.`
  if (block.tipo === 'opcion-multiple' && block.criterios.length > 0) return `${nombre} (Multiple Choice) se corrige con la opción correcta: no lleva criterios.`
  if (block.criterios.length > CRITERIOS_MAXIMOS) return `${nombre} puede tener hasta ${CRITERIOS_MAXIMOS} criterios.`
  const ids = new Set()
  for (const [i, c] of block.criterios.entries()) {
    const n = `${nombre}, criterio ${i + 1}`
    if (typeof c?.texto !== 'string' || !c.texto.trim()) return `${n}: escribí el criterio.`
    if (c.texto.length > CRITERIO_TEXTO_MAXIMO) return `${n}: el texto puede tener hasta ${CRITERIO_TEXTO_MAXIMO} caracteres.`
    if (!esNumero(c.peso) || c.peso <= 0 || c.peso > PUNTAJE_MAXIMO || !dosDecimales(c.peso)) return `${n}: el peso tiene que ser mayor que 0 y hasta ${PUNTAJE_MAXIMO}.`
    if (typeof c.id !== 'string' || !c.id || ids.has(c.id)) return `${n}: identificador inválido.`
    ids.add(c.id)
  }
  return null
}

export function validarUmbral(valor) {
  return esNumero(valor) && valor >= 0 && valor <= 1 && dosDecimales(valor)
}

// Puntaje de una pregunta a partir del cumplimiento de cada criterio (0, 0,5 o 1) y su peso: respeta exactamente las
// ponderaciones del profesor (no depende de la aritmética del modelo).
export function puntajePorCriterios(puntajeMax, criterios) {
  const pesoTotal = criterios.reduce((s, c) => s + c.peso, 0)
  if (pesoTotal <= 0) return 0
  const logrado = criterios.reduce((s, c) => s + c.peso * c.cumplimiento, 0)
  return Math.min(puntajeMax, Math.max(0, redondear((puntajeMax * logrado) / pesoTotal)))
}

// Nota total con los puntajes definitivos: { total, maximo, nota } (nota de 0 a 10 con 2 decimales). Si alguna pregunta
// todavía no tiene puntaje definitivo, `nota` es null.
export function calcularNota(items) {
  const maximo = redondear(items.reduce((s, i) => s + Number(i.puntajeMax), 0))
  const completos = items.every((i) => i.puntajeFinal != null)
  const total = redondear(items.reduce((s, i) => s + Number(i.puntajeFinal ?? 0), 0))
  return { total, maximo, nota: completos && maximo > 0 ? redondear((total / maximo) * 10) : null }
}

// --- Resultado de un agente juez

export const NIVELES = { cumple: 1, parcial: 0.5, 'no-cumple': 0 }

// Esquema JSON que tiene que devolver el juez (salida estructurada del modelo). Los rangos se validan acá también,
// porque el esquema del proveedor no garantiza mínimos y máximos.
export const ESQUEMA_JUEZ = {
  type: 'object',
  additionalProperties: false,
  required: ['criterios', 'puntaje_sugerido', 'feedback', 'confianza'],
  properties: {
    criterios: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'nivel', 'justificacion'],
        properties: {
          id: { type: 'string' },
          nivel: { type: 'string', enum: Object.keys(NIVELES) },
          justificacion: { type: 'string' },
        },
      },
    },
    puntaje_sugerido: { type: 'number' },
    feedback: { type: 'string' },
    confianza: { type: 'number' },
  },
}

export class ResultadoInvalido extends Error {}

// Valida la salida del juez (objeto ya parseado) contra los criterios y el puntaje máximo de la pregunta. Devuelve el
// resultado normalizado o lanza ResultadoInvalido (cuenta como un intento fallido y se reintenta).
export function validarResultadoJuez(salida, { criterios, puntajeMax }) {
  const falla = (m) => { throw new ResultadoInvalido(`Resultado del juez inválido: ${m}`) }
  if (salida === null || typeof salida !== 'object' || Array.isArray(salida)) falla('no es un objeto JSON')
  const { puntaje_sugerido: puntaje, feedback, confianza } = salida
  if (!esNumero(puntaje)) falla('falta el puntaje sugerido')
  if (puntaje < 0) falla('puntaje menor que 0')
  if (puntaje > puntajeMax) falla(`puntaje mayor que el máximo (${puntajeMax})`)
  if (typeof feedback !== 'string' || !feedback.trim()) falla('falta el feedback')
  if (feedback.length > FEEDBACK_MAXIMO) falla(`feedback de más de ${FEEDBACK_MAXIMO} caracteres`)
  if (!esNumero(confianza) || confianza < 0 || confianza > 1) falla('la confianza tiene que estar entre 0 y 1')
  if (!Array.isArray(salida.criterios)) falla('faltan los criterios')
  const porId = new Map()
  for (const c of salida.criterios) {
    if (!c || typeof c.id !== 'string' || !Object.hasOwn(NIVELES, c.nivel) || porId.has(c.id)) falla('criterio mal formado o repetido')
    if (typeof c.justificacion !== 'string' || c.justificacion.length > FEEDBACK_MAXIMO) falla('justificación inválida')
    porId.set(c.id, c)
  }
  if (porId.size !== criterios.length || criterios.some((c) => !porId.has(c.id))) falla('no evaluó exactamente los criterios pedidos')
  const evaluados = criterios.map((c) => ({
    id: c.id, texto: c.texto, peso: c.peso,
    cumplimiento: NIVELES[porId.get(c.id).nivel],
    justificacion: porId.get(c.id).justificacion.trim(),
  }))
  return {
    criterios: evaluados,
    // El puntaje sugerido sale de los criterios cumplidos y sus pesos; el número que propuso el modelo queda en los
    // datos internos del juez, para auditoría.
    puntaje: puntajePorCriterios(puntajeMax, evaluados),
    puntajeModelo: redondear(puntaje),
    feedback: feedback.trim(),
    confianza: Math.round(confianza * 1000) / 1000,
  }
}

// --- Estados

// Estado de corrección de una entrega (entregas.estado_correccion) tal como lo ve el profesor.
export const ESTADO_CORRECCION = {
  entregado: { label: 'Entregado', className: 'chip' },
  'en-evaluacion': { label: 'En evaluación', className: 'chip pending' },
  evaluado: { label: 'Evaluado', className: 'chip exited' },
  publicado: { label: 'Publicado', className: 'chip published' },
}

// El alumno no ve los estados internos: antes de publicar, solo "Entregado" o "En corrección".
export function estadoParaAlumno(estado) {
  if (estado === 'publicado') return 'publicado'
  return estado === 'entregado' ? 'entregado' : 'en-correccion'
}

export const ESTADO_ALUMNO_CORRECCION = {
  entregado: { label: 'Entregado', className: 'chip' },
  'en-correccion': { label: 'En corrección', className: 'chip pending' },
  publicado: { label: 'Nota publicada', className: 'chip published' },
}

// Estado de la evaluación de cada pregunta.
export const ESTADO_EVALUACION = {
  pendiente: { label: 'En cola', className: 'chip' },
  procesando: { label: 'Corrigiendo…', className: 'chip pending' },
  evaluada: { label: 'Evaluada automáticamente', className: 'chip exited' },
  error: { label: 'Error del juez · corrección manual', className: 'chip incorrect' },
  manual: { label: 'Pendiente de corrección manual', className: 'chip incorrect' },
  revisada: { label: 'Revisada por profesor', className: 'chip published' },
}

// Preguntas que impiden publicar: las que no tienen puntaje definitivo.
export function pendientesDePublicar(items) {
  return items.filter((i) => i.puntajeFinal == null)
}
