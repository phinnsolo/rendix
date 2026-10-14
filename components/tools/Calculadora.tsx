"use client";

import { useState, type FormEvent } from "react";
import { evaluate } from "@/lib/calculator";

const TECLAS: { label: string; valor: string; clase?: string; aria?: string }[] = [
  { label: "C", valor: "clear", aria: "Borrar todo" },
  { label: "(", valor: "(" },
  { label: ")", valor: ")" },
  { label: "÷", valor: "/", clase: "calc-op", aria: "Dividir" },
  { label: "7", valor: "7" },
  { label: "8", valor: "8" },
  { label: "9", valor: "9" },
  { label: "×", valor: "*", clase: "calc-op", aria: "Multiplicar" },
  { label: "4", valor: "4" },
  { label: "5", valor: "5" },
  { label: "6", valor: "6" },
  { label: "−", valor: "-", clase: "calc-op", aria: "Restar" },
  { label: "1", valor: "1" },
  { label: "2", valor: "2" },
  { label: "3", valor: "3" },
  { label: "+", valor: "+", clase: "calc-op", aria: "Sumar" },
  { label: "0", valor: "0" },
  { label: ".", valor: ".", aria: "Punto decimal" },
  { label: "⌫", valor: "back", aria: "Borrar último" },
  { label: "=", valor: "equals", clase: "calc-eq", aria: "Calcular" },
];

export default function Calculadora() {
  const [expresion, setExpresion] = useState("");
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calcular() {
    if (expresion.trim() === "") return;
    const r = evaluate(expresion);
    if (r.ok) {
      setResultado(String(r.value));
      setError(null);
      setExpresion(String(r.value));
    } else {
      setResultado(null);
      setError(r.error);
    }
  }

  function presionar(valor: string) {
    setError(null);
    if (valor === "clear") {
      setExpresion("");
      setResultado(null);
    } else if (valor === "back") {
      setExpresion((e) => e.slice(0, -1));
    } else if (valor === "equals") {
      calcular();
    } else {
      setExpresion((e) => e + valor);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    calcular();
  }

  return (
    <div className="card" data-testid="herramienta-calculadora">
      <h3>Calculadora</h3>
      <form onSubmit={onSubmit}>
        <input
          className="input calc-display"
          aria-label="Expresión"
          value={expresion}
          onChange={(e) => {
            setExpresion(e.target.value);
            setError(null);
          }}
          placeholder="0"
          inputMode="decimal"
          autoComplete="off"
        />
      </form>
      <div className="calc-result" aria-live="polite" data-testid="calc-resultado">
        {error ? <span className="field-error">{error}</span> : resultado !== null ? `= ${resultado}` : ""}
      </div>
      <div className="calc-keys">
        {TECLAS.map((t) => (
          <button key={t.valor} type="button" className={t.clase} onClick={() => presionar(t.valor)} aria-label={t.aria ?? t.label}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
