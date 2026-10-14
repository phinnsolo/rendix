// Evaluador de expresiones aritméticas SIN eval(): tokenizer + parser descendente recursivo.
//
// Gramática:
//   expresion := termino (("+" | "-") termino)*
//   termino   := factor (("*" | "/") factor)*
//   factor    := ("+" | "-") factor | primario
//   primario  := numero | "(" expresion ")"

export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

export const ERROR_DIVISION_CERO = "No se puede dividir por cero";
export const ERROR_SINTAXIS = "Expresión inválida";

type Token = { type: "num"; value: number } | { type: "op"; value: "+" | "-" | "*" | "/" | "(" | ")" };

class CalcError extends Error {}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const src = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, ".");
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " ") {
      i++;
    } else if ("+-*/()".includes(ch)) {
      tokens.push({ type: "op", value: ch as "+" | "-" | "*" | "/" | "(" | ")" });
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const raw = src.slice(i, j);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(raw)) throw new CalcError(ERROR_SINTAXIS);
      tokens.push({ type: "num", value: Number(raw) });
      i = j;
    } else {
      throw new CalcError(ERROR_SINTAXIS);
    }
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const value = this.expresion();
    if (this.pos < this.tokens.length) throw new CalcError(ERROR_SINTAXIS);
    return value;
  }

  private peekOp(...ops: string[]): string | null {
    const t = this.tokens[this.pos];
    return t && t.type === "op" && ops.includes(t.value) ? t.value : null;
  }

  private expresion(): number {
    let value = this.termino();
    let op: string | null;
    while ((op = this.peekOp("+", "-"))) {
      this.pos++;
      const rhs = this.termino();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  private termino(): number {
    let value = this.factor();
    let op: string | null;
    while ((op = this.peekOp("*", "/"))) {
      this.pos++;
      const rhs = this.factor();
      if (op === "*") {
        value = value * rhs;
      } else {
        if (rhs === 0) throw new CalcError(ERROR_DIVISION_CERO);
        value = value / rhs;
      }
    }
    return value;
  }

  private factor(): number {
    const op = this.peekOp("+", "-");
    if (op) {
      this.pos++;
      const value = this.factor();
      return op === "-" ? -value : value;
    }
    return this.primario();
  }

  private primario(): number {
    const t = this.tokens[this.pos];
    if (!t) throw new CalcError(ERROR_SINTAXIS);
    if (t.type === "num") {
      this.pos++;
      return t.value;
    }
    if (t.value === "(") {
      this.pos++;
      const value = this.expresion();
      if (!this.peekOp(")")) throw new CalcError(ERROR_SINTAXIS);
      this.pos++;
      return value;
    }
    throw new CalcError(ERROR_SINTAXIS);
  }
}

/** Redondea para evitar artefactos de punto flotante (0.1 + 0.2 = 0.3). */
function normalizar(value: number): number {
  const n = Number.parseFloat(value.toPrecision(12));
  return Object.is(n, -0) ? 0 : n;
}

export function evaluate(expression: string): CalcResult {
  try {
    const tokens = tokenize(expression);
    if (tokens.length === 0) return { ok: false, error: ERROR_SINTAXIS };
    const value = new Parser(tokens).parse();
    if (!Number.isFinite(value)) return { ok: false, error: "Resultado fuera de rango" };
    return { ok: true, value: normalizar(value) };
  } catch (error) {
    if (error instanceof CalcError) return { ok: false, error: error.message };
    throw error;
  }
}
