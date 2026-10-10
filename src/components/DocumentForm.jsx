import { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSession } from '../auth.js'
import { getClase, getClasesDe } from '../clasesStore.js'
import { createBlock, getBlocks, validateBlocks } from '../documentBlocks.js'
import { DURACION_MAXIMA, DURACION_POR_DEFECTO, TEMAS } from '../config.js'
import { getDuracion, getHerramientas, getTema, isValidDuracion } from '../examSettings.js'
import { hasStarted, validateHorario } from '../turnosStore.js'
import DurationField from './DurationField.jsx'
import HorariosField, { nuevoHorario } from './HorariosField.jsx'
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

// `initialHorarios` son los turnos ya asignados al parcial (al editar).
// `claseId` preselecciona la clase al crear un parcial desde ella.
export default function DocumentForm({ initialValues, initialHorarios = [], claseId: claseInicial = '', onSubmit, submitLabel, cancelTo }) {
  const formId = useId()
  const clases = getClasesDe(getSession().username)
  // Si el parcial no tiene clase (o ya no es de una clase del profesor), hay que elegirla.
  const [claseId, setClaseId] = useState(() => {
    const saved = initialValues?.claseId ?? claseInicial
    return clases.some((c) => c.id === saved) ? saved : ''
  })
  const turnoClase = getClase(claseId)?.turno ?? ''
  const [titulo, setTitulo] = useState(initialValues?.titulo ?? '')
  // Si el documento tiene un tema que ya no está en la lista, hay que elegir uno de nuevo.
  const [tema, setTema] = useState(() => {
    const saved = getTema(initialValues)
    return TEMAS.includes(saved) ? saved : ''
  })
  const [herramientas, setHerramientas] = useState(() => getHerramientas(initialValues))
  const [duracion, setDuracion] = useState(() => String(getDuracion(initialValues) ?? DURACION_POR_DEFECTO))
  const [bloques, setBloques] = useState(() => {
    const existing = initialValues ? getBlocks(initialValues) : []
    return existing.length > 0 ? existing : [createBlock('texto')]
  })
  const [horarios, setHorarios] = useState(() =>
    initialHorarios.length > 0
      ? initialHorarios.map((t) => ({ ...t, key: t.id, turno: t.turno ?? '', bloqueado: hasStarted(t) }))
      : [nuevoHorario(turnoClase)]
  )
  const [erroresHorarios, setErroresHorarios] = useState([])
  // Si un turno ya empezó, cambiar la duración cambiaría un examen en curso.
  const duracionBloqueada = horarios.some((h) => h.bloqueado)
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

  // Al cambiar de clase, las filas nuevas sin turno elegido toman el de la clase.
  function handleClase(id) {
    setClaseId(id)
    const turno = getClase(id)?.turno ?? ''
    setHorarios((current) => current.map((h) => (h.id || h.turno ? h : { ...h, turno })))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!claseId) {
      setError('Elegí una clase.')
      return
    }
    if (!titulo.trim()) {
      setError('El título es obligatorio.')
      return
    }
    if (!tema) {
      setError('Elegí un tema.')
      return
    }
    const minutos = Number(duracion)
    if (!isValidDuracion(minutos)) {
      setError(`La duración tiene que ser entre 1 y ${DURACION_MAXIMA} minutos.`)
      return
    }
    const nuevosErrores = horarios.map((h) => (h.bloqueado ? {} : validateHorario(h, minutos)))
    setErroresHorarios(nuevosErrores)
    if (horarios.length === 0) {
      setError('Asigná al menos un turno.')
      return
    }
    if (nuevosErrores.some((e) => Object.keys(e).length > 0)) {
      setError('Revisá los turnos asignados.')
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
      onSubmit({
        claseId,
        titulo: titulo.trim(),
        tema,
        herramientas,
        duracion: minutos,
        bloques: saved,
        horarios: horarios
          .filter((h) => !h.bloqueado)
          .map(({ id, turno, fecha, horaInicio }) => ({ id, turno, fecha, horaInicio })),
      })
    } catch {
      setError('No se pudo guardar: el almacenamiento del navegador está lleno.')
    }
  }

  return (
    <div className="form">
      {/* Los apartados quedan fuera del <form>: así ningún botón o Enter dentro de GeoGebra lo envía. */}
      {/* noValidate: los errores se muestran con el mensaje propio del formulario. */}
      <form id={formId} className="form" onSubmit={handleSubmit} noValidate>
        <label>
          Clase
          <select value={claseId} onChange={(e) => handleClase(e.target.value)}>
            <option value="" disabled>Elegí una clase</option>
            {clases.map((clase) => (
              <option key={clase.id} value={clase.id}>{clase.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Título
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
        </label>
        <TopicSelector value={tema} onChange={setTema} />
        <DurationField value={duracion} onChange={setDuracion} disabled={duracionBloqueada} />
        <HorariosField
          value={horarios}
          onChange={(nuevos) => {
            setHorarios(nuevos)
            setErroresHorarios([])
          }}
          duracion={Number(duracion)}
          errores={erroresHorarios}
          turnoPorDefecto={turnoClase}
        />
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
