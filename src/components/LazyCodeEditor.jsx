import { lazy, Suspense } from 'react'

// CodeMirror pesa bastante: se descarga solo cuando el documento tiene un bloque de código.
const CodeEditor = lazy(() => import('./CodeEditor.jsx'))

export default function LazyCodeEditor(props) {
  return (
    <Suspense fallback={<p className="muted small">Cargando editor…</p>}>
      <CodeEditor {...props} />
    </Suspense>
  )
}
