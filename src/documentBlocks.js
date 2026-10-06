// Modelo de apartados (bloques) de un documento. El orden del array es el orden del documento.
//   { id, tipo: 'texto',    contenido }
//   { id, tipo: 'geogebra', ggbBase64 }            ggbBase64: construcción de GeoGebra (null = vacía)
//   { id, tipo: 'codigo',   lenguaje, contenido }

export const BLOCK_TYPES = {
  texto: 'Texto',
  geogebra: 'GeoGebra',
  codigo: 'Código',
}

export const CODE_LANGUAGES = {
  python: 'Python',
  javascript: 'JavaScript',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  sql: 'SQL',
}

export function createBlock(tipo) {
  const id = crypto.randomUUID()
  if (tipo === 'geogebra') return { id, tipo, ggbBase64: null }
  if (tipo === 'codigo') return { id, tipo, lenguaje: 'python', contenido: '' }
  return { id, tipo: 'texto', contenido: '' }
}

// Los documentos anteriores a los bloques solo tienen `contenido`: se leen como un único bloque de texto.
// No se modifica lo guardado; el documento pasa a tener `bloques` recién cuando se vuelve a guardar.
export function getBlocks(doc) {
  if (Array.isArray(doc.bloques)) return doc.bloques
  if (!doc.contenido) return []
  return [{ id: `${doc.id}-contenido`, tipo: 'texto', contenido: doc.contenido }]
}

// Texto plano del documento (los bloques de texto unidos). Se guarda en `contenido`
// para que el documento siga siendo legible por versiones que no conocen los bloques.
export function textFromBlocks(bloques) {
  return bloques
    .filter((block) => block.tipo === 'texto' && block.contenido.trim())
    .map((block) => block.contenido)
    .join('\n\n')
}
