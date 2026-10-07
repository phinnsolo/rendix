// Modelo de apartados (bloques) de un documento. El orden del array es el orden del documento.
// Todos los apartados tienen `consigna` (lo que escribe el profesor). El resto es la configuración
// de cada tipo, que además define el punto de partida de la respuesta del alumno (ver emptyAnswer).
//   { id, tipo: 'texto',           consigna, contenido }           contenido: texto del apartado
//   { id, tipo: 'codigo',          consigna, lenguaje, contenido } contenido: código inicial
//   { id, tipo: 'geogebra',        consigna, ggbBase64 }           construcción inicial (null = vacía)
//   { id, tipo: 'opcion-multiple', consigna, opciones: [{ id, texto, correcta }] }

export const BLOCK_TYPES = {
  texto: 'Texto',
  codigo: 'Código',
  geogebra: 'GeoGebra',
  'opcion-multiple': 'Multiple Choice',
}

export const CODE_LANGUAGES = {
  python: 'Python',
  javascript: 'JavaScript',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  sql: 'SQL',
}

export function createOption() {
  return { id: crypto.randomUUID(), texto: '', correcta: false }
}

export function createBlock(tipo) {
  const id = crypto.randomUUID()
  if (tipo === 'geogebra') return { id, tipo, consigna: '', ggbBase64: null }
  if (tipo === 'codigo') return { id, tipo, consigna: '', lenguaje: 'python', contenido: '' }
  if (tipo === 'opcion-multiple') return { id, tipo, consigna: '', opciones: [createOption(), createOption()] }
  return { id, tipo: 'texto', consigna: '', contenido: '' }
}

// Completa los campos que no existían en versiones anteriores. No modifica lo guardado:
// el documento queda actualizado recién cuando se vuelve a guardar.
function normalizeBlock(block) {
  if (block.tipo === 'texto') {
    // En la primera versión de bloques, el texto (sin consigna) era el enunciado: pasa a ser la consigna.
    if (block.consigna === undefined) return { id: block.id, tipo: 'texto', consigna: block.contenido ?? '', contenido: '' }
    return { ...block, contenido: block.contenido ?? '' }
  }
  return { ...block, consigna: block.consigna ?? '' }
}

// Los documentos anteriores a los bloques solo tienen `contenido`: se leen como un único bloque de texto.
export function getBlocks(doc) {
  if (Array.isArray(doc.bloques)) return doc.bloques.map(normalizeBlock)
  if (!doc.contenido) return []
  return [{ id: `${doc.id}-contenido`, tipo: 'texto', consigna: doc.contenido, contenido: '' }]
}

// Devuelve un mensaje de error si algún apartado no se puede guardar, o null.
export function validateBlocks(bloques) {
  for (const [index, block] of bloques.entries()) {
    if (block.tipo !== 'opcion-multiple') continue
    const name = `El apartado ${index + 1} (Multiple Choice)`
    if (block.opciones.length < 2) return `${name} necesita al menos 2 opciones.`
    if (block.opciones.some((opcion) => !opcion.texto.trim())) return `${name} tiene opciones vacías.`
    if (!block.opciones.some((opcion) => opcion.correcta)) return `${name} necesita una respuesta correcta.`
  }
  return null
}

// Respuesta inicial del alumno para un apartado. Define también la forma en que se guarda en la entrega.
export function emptyAnswer(block) {
  if (block.tipo === 'codigo') return block.contenido
  if (block.tipo === 'geogebra') return block.ggbBase64
  if (block.tipo === 'opcion-multiple') return null // id de la opción elegida
  return ''
}

// Texto plano del documento (consignas y textos unidos). Se guarda en `contenido`
// para que el documento siga siendo legible por versiones que no conocen los bloques.
export function textFromBlocks(bloques) {
  return bloques
    .flatMap((block) => [block.consigna, block.tipo === 'texto' ? block.contenido : ''])
    .map((text) => text.trim())
    .filter(Boolean)
    .join('\n\n')
}
