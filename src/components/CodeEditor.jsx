import { useEffect, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { sql } from '@codemirror/lang-sql'

// Claves iguales a CODE_LANGUAGES de documentBlocks.js. C y C++ comparten el resaltado.
const LANGUAGE_EXTENSIONS = { python, javascript, java, c: cpp, cpp, sql }

const theme = EditorView.theme({
  '&': { fontSize: '0.95rem', backgroundColor: 'var(--surface)' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', borderRight: '1px solid var(--border)', color: 'var(--muted)' },
  '&.cm-focused': { outline: 'none' },
})

function languageExtension(language) {
  return (LANGUAGE_EXTENSIONS[language] ?? python)()
}

// Wrapper mínimo de CodeMirror 6: el editor es la fuente de verdad del texto y avisa cada cambio con onChange.
// `value` solo se aplica al montar o cuando difiere del contenido actual.
// Se importa con lazy() para que CodeMirror se descargue recién cuando hay un bloque de código.
export default function CodeEditor({ value, language, onChange, label = 'Código' }) {
  const parentRef = useRef(null)
  const viewRef = useRef(null)
  const languageCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const view = new EditorView({
      parent: parentRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          indentUnit.of('    '),
          languageCompartment.current.of(languageExtension(language)),
          theme,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => view.destroy()
    // El editor se crea una sola vez; los cambios de value/language se aplican en los efectos de abajo.
  }, [])

  useEffect(() => {
    viewRef.current.dispatch({
      effects: languageCompartment.current.reconfigure(languageExtension(language)),
    })
  }, [language])

  useEffect(() => {
    const view = viewRef.current
    const current = view.state.doc.toString()
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  return <div className="code-editor" ref={parentRef} />
}
