"use client";

import { Check, Flag } from "lucide-react";

export interface EstadoNavegador {
  id: string;
  numero: number;
  respondida: boolean;
  marcada: boolean;
}

/**
 * Navegador compacto de preguntas. Cada estado se distingue por forma, no solo por color:
 * actual = relleno sólido · respondida = borde sólido + tilde · sin responder = borde punteado
 * · marcada = banderita en la esquina.
 */
export default function QuestionNavigator({
  preguntas,
  actual,
  onSeleccionar,
  etiqueta = "Preguntas",
}: {
  preguntas: EstadoNavegador[];
  actual: number;
  onSeleccionar: (indice: number) => void;
  etiqueta?: string;
}) {
  return (
    <div className="qnav" role="tablist" aria-label={etiqueta}>
      {preguntas.map((p, i) => {
        const estado = [p.respondida ? "respondida" : "sin responder", p.marcada && "marcada para revisar"].filter(Boolean).join(", ");
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={i === actual}
            aria-label={`Pregunta ${p.numero}, ${estado}`}
            className={`qnav-item${i === actual ? " is-current" : ""}${p.respondida ? " is-answered" : ""}${p.marcada ? " is-flagged" : ""}`}
            onClick={() => onSeleccionar(i)}
            title={`Pregunta ${p.numero} · ${estado}`}
          >
            <span className="tabular">{p.numero}</span>
            {p.respondida && i !== actual && (
              <span className="qnav-check" aria-hidden>
                <Check width={9} height={9} strokeWidth={3} />
              </span>
            )}
            {p.marcada && (
              <span className="qnav-flag" aria-hidden>
                <Flag width={9} height={9} strokeWidth={2.5} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function LeyendaNavegador() {
  return (
    <ul className="qnav-legend" aria-label="Referencias">
      <li>
        <span className="qnav-item is-current is-sample" aria-hidden>
          1
        </span>
        Actual
      </li>
      <li>
        <span className="qnav-item is-answered is-sample" aria-hidden>
          2
        </span>
        Respondida
      </li>
      <li>
        <span className="qnav-item is-sample" aria-hidden>
          3
        </span>
        Sin responder
      </li>
      <li>
        <span className="qnav-item is-flagged is-sample" aria-hidden>
          4
          <span className="qnav-flag">
            <Flag width={9} height={9} strokeWidth={2.5} />
          </span>
        </span>
        Para revisar
      </li>
    </ul>
  );
}
