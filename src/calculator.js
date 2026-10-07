// Evaluador de expresiones para la calculadora del alumno (sin eval).
// Soporta + − × ÷ ^ %, paréntesis, multiplicación implícita (2π, 3(4+1)), constantes π, e, Ans
// y funciones √ sin cos tan asin acos atan ln log abs. `grados` indica cómo se leen los ángulos.

const FUNCTIONS = {
  sqrt: Math.sqrt,
  ln: Math.log,
  log: Math.log10,
  abs: Math.abs,
}
const TRIG = { sin: Math.sin, cos: Math.cos, tan: Math.tan }
const INVERSE_TRIG = { asin: Math.asin, acos: Math.acos, atan: Math.atan }

function tokenize(input) {
  const source = input
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/√/g, ' sqrt ')
    .replace(/π/g, ' pi ')
    .replace(/,/g, '.')
  const tokens = []
  const pattern = /\s*(?:(\d+\.?\d*|\.\d+)|([a-zA-Z]+)|(\S))/y
  let match
  while (pattern.lastIndex < source.length && (match = pattern.exec(source))) {
    if (match[1]) tokens.push({ type: 'num', value: Number(match[1]) })
    else if (match[2]) tokens.push({ type: 'id', value: match[2].toLowerCase() })
    else if (match[3]) tokens.push({ type: 'op', value: match[3] })
  }
  return tokens
}

export function evaluate(input, { grados = true, ans = 0 } = {}) {
  const tokens = tokenize(input)
  let pos = 0
  const peek = () => tokens[pos]
  const isOp = (value) => peek()?.type === 'op' && peek().value === value
  const fail = () => { throw new Error('Expresión inválida') }

  function expression() {
    let value = term()
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].value
      const right = term()
      value = op === '+' ? value + right : value - right
    }
    return value
  }

  function term() {
    let value = unary()
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = tokens[pos++].value
        const right = unary()
        value = op === '*' ? value * right : value / right
      } else if (peek() && (peek().type !== 'op' || peek().value === '(')) {
        value *= unary() // multiplicación implícita
      } else {
        return value
      }
    }
  }

  function unary() {
    if (isOp('-')) { pos++; return -unary() }
    if (isOp('+')) { pos++; return unary() }
    return power()
  }

  function power() {
    const base = postfix()
    if (isOp('^')) { pos++; return base ** unary() }
    return base
  }

  function postfix() {
    let value = primary()
    while (isOp('%')) { pos++; value /= 100 }
    return value
  }

  function primary() {
    const token = tokens[pos++]
    if (!token) fail()
    if (token.type === 'num') return token.value
    if (token.type === 'op' && token.value === '(') {
      const value = expression()
      if (isOp(')')) pos++ // permite olvidar el último paréntesis
      return value
    }
    if (token.type === 'id') {
      if (token.value === 'pi') return Math.PI
      if (token.value === 'e') return Math.E
      if (token.value === 'ans') return ans
      const toRad = grados ? Math.PI / 180 : 1
      const arg = () => unary()
      if (FUNCTIONS[token.value]) return FUNCTIONS[token.value](arg())
      if (TRIG[token.value]) return TRIG[token.value](arg() * toRad)
      if (INVERSE_TRIG[token.value]) return INVERSE_TRIG[token.value](arg()) / toRad
    }
    return fail()
  }

  const result = expression()
  if (pos < tokens.length || !Number.isFinite(result)) fail()
  return result
}

export function formatResult(value) {
  // Redondea errores de coma flotante (0.1 + 0.2 → 0.3, sin(180°) → 0).
  const rounded = Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12))
  return String(rounded)
}
