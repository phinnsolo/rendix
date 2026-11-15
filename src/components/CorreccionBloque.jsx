import { useState } from 'react'
import { CRITERIOS_MAXIMOS, CRITERIO_TEXTO_MAXIMO, PUNTAJE_MAXIMO, puntajeDe } from '../correccion.js'
import { createCriterio } from '../documentBlocks.js'

// Campo numérico que acepta coma decimal. Mientras se escribe guarda el texto; al bloque le pasa el número (o NaN si
// no es válido, así la validación del formulario lo marca).
export function CampoNumero({ value, onChange, label, className = '', ...props }) {
  const [texto, setTexto] = useState(() => (value == null || Number.isNaN(value) ? '' : String(value).replace('.', ',')))
  return (
    <input
      inputMode="decimal"
      className={className}
      aria-label={label}
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value)
        const limpio = e.target.value.trim().replace(',', '.')
        onChange(limpio === '' ? Number.NaN : Number(limpio))
      }}
      {...props}
    />
  )
}

// Puntaje máximo de un apartado y sus criterios de corrección con peso: lo que usan los agentes jueces. El alumno no
// ve los criterios. Multiple Choice se corrige con la opción correcta (solo puntaje); GeoGebra se corrige a mano,
// pero los criterios le sirven al profesor de guía.
export default function CorreccionBloque({ block, onChange }) {
  const criterios = block.criterios ?? []
  const conCriterios = block.tipo !== 'opcion-multiple'
  const pesoTotal = criterios.reduce((s, c) => s + (Number.isFinite(c.peso) ? c.peso : 0), 0)

  function cambiarCriterio(id, cambios) {
    onChange({ criterios: criterios.map((c) => (c.id === id ? { ...c, ...cambios } : c)) })
  }

  return (
    <div className="block-section correccion-bloque">
      <div className="correccion-head">
        <span className="block-answer-label">Corrección</span>
        <label className="block-field inline">
          Puntaje
          <CampoNumero className="puntaje-input" label="Puntaje máximo de la pregunta" title={`Entre 0,01 y ${PUNTAJE_MAXIMO}`} value={puntajeDe(block)} onChange={(puntaje) => onChange({ puntaje })} />
        </label>
      </div>
      {!conCriterios ? (
        <p className="muted hint">Se corrige sola: puntaje completo si elige la opción correcta, 0 si no.</p>
      ) : (
        <>
          {block.tipo === 'geogebra' && <p className="muted hint">Las construcciones de GeoGebra las corregís vos: los criterios te sirven de guía.</p>}
          {criterios.length === 0 ? (
            <p className="muted hint">Sin criterios, el juez evalúa si la respuesta es correcta y completa según la consigna.</p>
          ) : (
            <ol className="criterios">
              {criterios.map((c, i) => (
                <li key={c.id} className="criterio">
                  <input
                    value={c.texto}
                    onChange={(e) => cambiarCriterio(c.id, { texto: e.target.value })}
                    maxLength={CRITERIO_TEXTO_MAXIMO}
                    placeholder={`Criterio ${i + 1} (ej: justifica con la definición)`}
                    aria-label={`Criterio ${i + 1}`}
                  />
                  <label className="criterio-peso">
                    <span className="muted small">Peso</span>
                    <CampoNumero label={`Peso del criterio ${i + 1}`} value={c.peso} onChange={(peso) => cambiarCriterio(c.id, { peso })} />
                  </label>
                  <span className="muted small criterio-pct" title="Parte del puntaje de la pregunta">
                    {pesoTotal > 0 && Number.isFinite(c.peso) ? `${Math.round((c.peso / pesoTotal) * 100)} %` : '—'}
                  </span>
                  <button type="button" className="icon-button danger" onClick={() => onChange({ criterios: criterios.filter((x) => x.id !== c.id) })}
                    aria-label={`Quitar criterio ${i + 1}`} title="Quitar">×</button>
                </li>
              ))}
            </ol>
          )}
          {criterios.length < CRITERIOS_MAXIMOS && (
            <button type="button" className="link-button" onClick={() => onChange({ criterios: [...criterios, createCriterio()] })}>
              + Agregar criterio
            </button>
          )}
        </>
      )}
    </div>
  )
}
