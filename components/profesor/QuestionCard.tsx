import { Check, Lightbulb } from "lucide-react";
import { TipoBadge } from "@/components/TipoPregunta";
import type { TipoConsigna } from "@/lib/correccion";
import { formatPuntaje } from "@/lib/format";

interface Props {
  orden: number;
  texto: string;
  tipo: TipoConsigna;
  puntaje: number;
  opciones?: string[];
  respuestaCorrecta?: number | null;
  criterio?: string | null;
  extra?: React.ReactNode;
}

/** Vista de lectura de una pregunta (detalle de examen, banco de preguntas). */
export default function QuestionCard({ orden, texto, tipo, puntaje, opciones = [], respuestaCorrecta = null, criterio, extra }: Props) {
  return (
    <article className="qcard">
      <div className="qcard-num" aria-hidden>
        {String(orden).padStart(2, "0")}
      </div>
      <div className="qcard-body">
        <div className="row-between">
          <div className="row">
            <span className="sr-only">Pregunta {orden}.</span>
            <TipoBadge tipo={tipo} />
            <span className="small muted">{formatPuntaje(puntaje)}</span>
          </div>
          {extra}
        </div>
        <p className="qcard-text pre-wrap">{texto}</p>
        {opciones.length > 0 && (
          <ul className="qcard-options">
            {opciones.map((o, i) => (
              <li key={i} className={i === respuestaCorrecta ? "is-correct" : undefined}>
                <span className="qcard-letter" aria-hidden>
                  {i === respuestaCorrecta ? <Check width={12} height={12} /> : String.fromCharCode(65 + i)}
                </span>
                <span className="grow">{o}</span>
                {i === respuestaCorrecta && <span className="xsmall strong">Correcta</span>}
              </li>
            ))}
          </ul>
        )}
        {criterio && (
          <div className="qcard-criterio">
            <Lightbulb className="icon" aria-hidden />
            <span className="pre-wrap">
              <span className="strong">Criterio: </span>
              {criterio}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
