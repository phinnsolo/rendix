import { useRef, useState } from 'react'
import { evaluate, formatResult } from '../calculator.js'

// Cada botón agrega su texto a la expresión; los especiales tienen su propia acción.
const KEYS = [
  ['sin(', 'cos(', 'tan(', '√(', '^'],
  ['ln(', 'log(', 'π', '(', ')'],
  ['7', '8', '9', '÷', 'C'],
  ['4', '5', '6', '×', '⌫'],
  ['1', '2', '3', '−', '%'],
  ['0', '.', 'Ans', '+', '='],
]
const LABELS = { 'sin(': 'sin', 'cos(': 'cos', 'tan(': 'tan', '√(': '√', 'ln(': 'ln', 'log(': 'log' }

// Calculadora científica simple para el alumno. Se puede escribir con el teclado o con los botones.
export default function Calculator() {
  const [expresion, setExpresion] = useState('')
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState(false)
  const [grados, setGrados] = useState(true)
  const ans = useRef(0)
  const inputRef = useRef(null)

  function calcular() {
    if (!expresion.trim()) return
    try {
      const valor = evaluate(expresion, { grados, ans: ans.current })
      ans.current = valor
      setResultado({ expresion, valor: formatResult(valor) })
      setExpresion(formatResult(valor))
      setError(false)
    } catch {
      setError(true)
    }
  }

  function press(key) {
    setError(false)
    if (key === '=') calcular()
    else if (key === 'C') { setExpresion(''); setResultado(null) }
    else if (key === '⌫') setExpresion((e) => e.slice(0, -1))
    else setExpresion((e) => e + key)
    inputRef.current?.focus()
  }

  return (
    <div className="calculator">
      <div className="calculator-display">
        <span className="calculator-history muted">
          {resultado ? `${resultado.expresion} =` : ' '}
        </span>
        <input
          ref={inputRef}
          value={expresion}
          onChange={(e) => { setExpresion(e.target.value); setError(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); calcular() }
            if (e.key === 'Escape') { setExpresion(''); setResultado(null) }
          }}
          aria-label="Expresión"
          placeholder="0"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="calculator-status">
          {error ? <span className="error">Expresión inválida</span> : ' '}
          <button type="button" className="link-button" onClick={() => setGrados((g) => !g)} title="Unidad de los ángulos">
            {grados ? 'DEG' : 'RAD'}
          </button>
        </span>
      </div>
      <div className="calculator-keys">
        {KEYS.flat().map((key) => (
          <button
            key={key}
            type="button"
            className={key === '=' ? 'calc-key equals' : /^[\d.]$/.test(key) ? 'calc-key digit' : 'calc-key'}
            onClick={() => press(key)}
          >
            {LABELS[key] ?? key}
          </button>
        ))}
      </div>
    </div>
  )
}
