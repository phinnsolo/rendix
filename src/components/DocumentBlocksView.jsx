import { BLOCK_TYPES, CODE_LANGUAGES } from '../documentBlocks.js'
import GeoGebraApplet from './GeoGebraApplet.jsx'
import LazyCodeEditor from './LazyCodeEditor.jsx'

// Apartados en modo lectura, en el orden guardado. GeoGebra sigue siendo interactivo,
// pero lo que se haga acá no se guarda (para eso está Editar).
export default function DocumentBlocksView({ blocks }) {
  if (blocks.length === 0) {
    return <div className="card content"><span className="muted">(Sin contenido)</span></div>
  }

  return (
    <div className="blocks">
      {blocks.map((block) => {
        if (block.tipo === 'texto') {
          return <div key={block.id} className="card content">{block.contenido}</div>
        }
        if (block.tipo === 'geogebra') {
          return (
            <section key={block.id} className="card block" aria-label={BLOCK_TYPES.geogebra}>
              <span className="block-type">{BLOCK_TYPES.geogebra}</span>
              <GeoGebraApplet initialBase64={block.ggbBase64} />
            </section>
          )
        }
        return (
          <section key={block.id} className="card block" aria-label={BLOCK_TYPES.codigo}>
            <span className="block-type">
              {BLOCK_TYPES.codigo} · {CODE_LANGUAGES[block.lenguaje] ?? block.lenguaje}
            </span>
            <LazyCodeEditor value={block.contenido} language={block.lenguaje} readOnly />
          </section>
        )
      })}
    </div>
  )
}
