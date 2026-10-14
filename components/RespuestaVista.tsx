"use client";

import { Check, X } from "lucide-react";
import DiagramEditor from "@/components/tools/DiagramEditor";
import type { TipoConsigna } from "@/lib/correccion";
import { diagramaTieneContenido, type Diagrama } from "@/lib/diagrama";

interface Props {
  tipo?: TipoConsigna;
  texto: string;
  opciones?: string[];
  opcionSeleccionada?: number | null;
  diagrama?: Diagrama | null;
  habilitarEscritura: boolean;
  /** Solo para el profesor: resalta la opción correcta. */
  respuestaCorrecta?: number | null;
  alturaDiagrama?: number;
}

/** Muestra la respuesta de un alumno en modo lectura, según el tipo de consigna. */
export default function RespuestaVista({
  tipo = "DESARROLLO",
  texto,
  opciones = [],
  opcionSeleccionada = null,
  diagrama = null,
  habilitarEscritura,
  respuestaCorrecta = null,
  alturaDiagrama = 380,
}: Props) {
  if (tipo === "OPCION_MULTIPLE" || tipo === "VERDADERO_FALSO") {
    return (
      <div className="opciones" data-testid="respuesta-opciones">
        {opcionSeleccionada === null && <em className="muted small">Sin responder</em>}
        {opciones.map((o, i) => {
          const elegida = i === opcionSeleccionada;
          const conCorreccion = respuestaCorrecta !== null;
          const clase = conCorreccion
            ? i === respuestaCorrecta
              ? "correcta"
              : elegida
                ? "incorrecta"
                : ""
            : elegida
              ? "elegida"
              : "";
          return (
            <div key={i} className={`opcion-vista ${clase}`}>
              <span className="opcion-mark" aria-hidden>
                {conCorreccion && i === respuestaCorrecta ? (
                  <Check width={12} height={12} />
                ) : conCorreccion && elegida ? (
                  <X width={12} height={12} />
                ) : (
                  String.fromCharCode(65 + i)
                )}
              </span>
              <span style={{ flex: 1 }}>{o}</span>
              {elegida && <span className="small opcion-tag">Elegida por el alumno</span>}
              {conCorreccion && i === respuestaCorrecta && <span className="small opcion-tag">✓ Correcta</span>}
            </div>
          );
        })}
      </div>
    );
  }

  if (tipo === "DIAGRAMA") {
    return diagramaTieneContenido(diagrama) ? (
      <DiagramEditor value={diagrama} readOnly height={alturaDiagrama} expandible />
    ) : (
      <em className="muted small">El alumno no dibujó ningún diagrama</em>
    );
  }

  if (!habilitarEscritura) return <em className="muted small">Escritura no habilitada</em>;
  return texto.trim() ? (
    <div className="respuesta-texto pre-wrap">{texto}</div>
  ) : (
    <em className="muted small">Sin respuesta escrita</em>
  );
}
