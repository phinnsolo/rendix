"use client";

import { useRouter } from "next/navigation";

/** Selector de examen para la vista de resultados (navega con ?examen=). */
export default function SelectorExamen({ opciones, valor }: { opciones: { id: string; titulo: string }[]; valor: string }) {
  const router = useRouter();
  return (
    <div className="field" style={{ minWidth: 260 }}>
      <label className="label sr-only" htmlFor="selector-examen">
        Examen
      </label>
      <select
        id="selector-examen"
        className="select"
        value={valor}
        onChange={(e) => router.push(`/profesor/resultados?examen=${e.target.value}`)}
      >
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.titulo}
          </option>
        ))}
      </select>
    </div>
  );
}
