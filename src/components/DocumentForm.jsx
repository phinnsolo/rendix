import { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createBlock, getBlocks, validateBlocks } from '../documentBlocks.js'
import { TEMAS } from '../config.js'
import { getHerramientas, getTema } from '../examSettings.js'
import DocumentBlock from './DocumentBlock.jsx'
import BlockTypeSelector from './BlockTypeSelector.jsx'
import TopicSelector from './TopicSelector.jsx'
import AllowedToolsSelector from './AllowedToolsSelector.jsx'

function hasContent(block) {
  return (
    block.tipo === 'geogebra' ||
    Boolean(block.consigna.trim() || block.contenido?.trim()) ||
    Boolean(block.opciones?.some((opcion) => opcion.texto.trim()))
  )
}

export default function DocumentForm({ initialValues, onSubmit, submitLabel, cancelTo }) {
  const formId = useId()
  const [titulo, setTitulo] = useState(initialValues?.titulo ?? '')
  // Si el documento tiene un tema que ya no está en la lista, hay que elegir uno de nuevo.
  const [tema, setTema] = useState(() => {
    const saved = getTema(initialValues)
    return TEMAS.includes(saved) ? saved : ''
  })
  const [herramientas, setHerramientas] = useState(() => getHerramientas(initialValues))
  const [bloques, setBloques] = useState(() => {
    const existing = initialValues ? getBlocks(initialValues) : []
    return existing.length > 0 ? existing : [createBlock('texto')]
  })
  const [error, setError] = useState('')
  // La construcción de cada GeoGebra vive dentro del applet: se lee recién al guardar.
  const geogebraApis = useRef(new Map())

  function updateBlock(id, changes) {
    setBloques((current) => current.map((block) => (block.id === id ? { ...block, ...changes } : block)))
  }

  function moveBlock(index, delta) {
    setBloques((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function removeBlock(block) {
    if (hasContent(block) && !window.confirm('¿Eliminar este apartado?')) return
    setBloques((current) => current.filter((b) => b.id !== block.id))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!titulo.trim()) {
      setError('El título es obligatorio.')
      return
    }
    if (!tema) {
      setError('Elegí un tema.')
      return
    }
    const blocksError = validateBlocks(bloques)
    if (blocksError) {
      setError(blocksError)
      return
    }
    const saved = bloques.map((block) => {
      const api = geogebraApis.current.get(block.id)
      return api ? { ...block, ggbBase64: api.getBase64() } : block
    })
    try {
      onSubmit({ titulo: titulo.trim(), tema, herramientas, bloques: saved })
    } catch {
      setError('No se pudo guardar: el almacenamiento del navegador está lleno.')
    }
  }

  return (
    <div className="form">
      {/* Los apartados quedan fuera del <form>: así ningún botón o Enter dentro de GeoGebra lo envía. */}
      <form id={formId} className="form" onSubmit={handleSubmit}>
        <label>
          Título
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
        </label>
        <TopicSelector value={tema} onChange={setTema} />
        <AllowedToolsSelector value={herramientas} onChange={setHerramientas} />
      </form>

      <div className="blocks">
        <span className="blocks-label">Consignas</span>
        {bloques.map((block, index) => (
          <DocumentBlock
            key={block.id}
            block={block}
            index={index}
            total={bloques.length}
            onChange={(changes) => updateBlock(block.id, changes)}
            onMove={(delta) => moveBlock(index, delta)}
            onRemove={() => removeBlock(block)}
            onGeoGebraReady={(api) => {
              if (api) geogebraApis.current.set(block.id, api)
              else geogebraApis.current.delete(block.id)
            }}
          />
        ))}
        <BlockTypeSelector onSelect={(tipo) => setBloques((current) => [...current, createBlock(tipo)])} />
      </div>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" form={formId}>{submitLabel}</button>
        <Link to={cancelTo} className="button secondary">Cancelar</Link>
      </div>
    </div>
  )
}
