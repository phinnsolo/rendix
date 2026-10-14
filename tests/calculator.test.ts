import { describe, expect, it } from "vitest";
import { ERROR_DIVISION_CERO, ERROR_SINTAXIS, evaluate } from "@/lib/calculator";

const valor = (expr: string) => {
  const r = evaluate(expr);
  if (!r.ok) throw new Error(`Se esperaba un valor para "${expr}" y se obtuvo: ${r.error}`);
  return r.value;
};

describe("US5 - Calculadora", () => {
  it("suma", () => {
    expect(valor("2+3")).toBe(5);
    expect(valor("0.1 + 0.2")).toBe(0.3);
  });

  it("resta", () => {
    expect(valor("10-4")).toBe(6);
    expect(valor("3-8")).toBe(-5);
  });

  it("multiplicación", () => {
    expect(valor("6*7")).toBe(42);
    expect(valor("2.5×4")).toBe(10);
  });

  it("división", () => {
    expect(valor("8/2")).toBe(4);
    expect(valor("7÷2")).toBe(3.5);
    expect(valor("1/3")).toBeCloseTo(0.333333333333, 10);
  });

  it("división por cero muestra error", () => {
    expect(evaluate("5/0")).toEqual({ ok: false, error: ERROR_DIVISION_CERO });
    expect(evaluate("1/(2-2)")).toEqual({ ok: false, error: ERROR_DIVISION_CERO });
  });

  it("respeta precedencia, paréntesis y signo negativo", () => {
    expect(valor("2+3*4")).toBe(14);
    expect(valor("(2+3)*4")).toBe(20);
    expect(valor("-3*-2")).toBe(6);
    expect(valor("10/4*2")).toBe(5);
  });

  it("expresiones inválidas devuelven error (no se ejecuta código: no usa eval)", () => {
    expect(evaluate("2+")).toEqual({ ok: false, error: ERROR_SINTAXIS });
    expect(evaluate("(2+3")).toEqual({ ok: false, error: ERROR_SINTAXIS });
    expect(evaluate("1..2")).toEqual({ ok: false, error: ERROR_SINTAXIS });
    expect(evaluate("alert(1)")).toEqual({ ok: false, error: ERROR_SINTAXIS });
    expect(evaluate("process.exit()")).toEqual({ ok: false, error: ERROR_SINTAXIS });
    expect(evaluate("")).toEqual({ ok: false, error: ERROR_SINTAXIS });
  });
});
