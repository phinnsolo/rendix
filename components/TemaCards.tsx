import { CircleCheck, ListChecks } from "lucide-react";
import { plural } from "@/lib/format";

export interface TemaCard {
  id: string;
  nombre: string;
  titulo: string | null;
  descripcion: string | null;
  preguntas: number;
}

interface Props {
  temas: TemaCard[];
  seleccionado?: string | null;
  /** Sin `onElegir` las tarjetas son de solo lectura (vista previa del profesor). */
  onElegir?: (tema: TemaCard) => void;
  deshabilitado?: boolean;
}

/** Tarjetas de temas tal como las ve el alumno antes de elegir. */
export default function TemaCards({ temas, seleccionado, onElegir, deshabilitado }: Props) {
  return (
    <ol className="topic-choices" data-testid="temas">
      {temas.map((t) => {
        const activo = seleccionado === t.id;
        return (
          <li key={t.id} className={`topic-choice${activo ? " is-selected" : ""}`}>
            <span className="eyebrow">{t.nombre}</span>
            <h3 className="topic-choice-title">{t.titulo || t.nombre}</h3>
            {t.descripcion && <p className="topic-choice-desc pre-wrap">{t.descripcion}</p>}
            <span className="meta-item xsmall muted">
              <ListChecks className="icon" aria-hidden />
              {plural(t.preguntas, "pregunta", "preguntas")}
            </span>
            {onElegir && (
              <button
                type="button"
                className={`btn btn-sm ${activo ? "btn-soft" : ""}`}
                onClick={() => onElegir(t)}
                disabled={deshabilitado}
                aria-label={`Elegir ${t.nombre}${t.titulo ? `: ${t.titulo}` : ""}`}
              >
                {activo && <CircleCheck className="icon" aria-hidden />}
                {activo ? "Tema elegido" : "Elegir tema"}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
