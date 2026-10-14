import { CircleDot, FileText, ToggleLeft, Workflow, type LucideIcon } from "lucide-react";
import type { TipoConsigna } from "@/lib/correccion";

// Identidad visual de cada tipo de pregunta (icono + nombre + descripción breve).
// Solo los tipos que existen en el modelo de datos.

export const TIPO_INFO: Record<TipoConsigna, { label: string; descripcion: string; correccion: string; Icon: LucideIcon }> = {
  OPCION_MULTIPLE: {
    label: "Opción múltiple",
    descripcion: "El alumno selecciona una opción entre varias.",
    correccion: "Corrección automática sugerida",
    Icon: CircleDot,
  },
  VERDADERO_FALSO: {
    label: "Verdadero / Falso",
    descripcion: "El alumno indica si una afirmación es verdadera o falsa.",
    correccion: "Corrección automática sugerida",
    Icon: ToggleLeft,
  },
  DESARROLLO: {
    label: "Desarrollo",
    descripcion: "El alumno responde con un texto libre.",
    correccion: "Corrección manual",
    Icon: FileText,
  },
  DIAGRAMA: {
    label: "Árbol de decisión",
    descripcion: "El alumno construye un diagrama con nodos y conectores.",
    correccion: "Corrección manual",
    Icon: Workflow,
  },
};

export const ORDEN_TIPOS: TipoConsigna[] = ["OPCION_MULTIPLE", "VERDADERO_FALSO", "DESARROLLO", "DIAGRAMA"];

export function TipoBadge({ tipo }: { tipo: TipoConsigna }) {
  const { label, Icon } = TIPO_INFO[tipo];
  return (
    <span className="badge badge-outline">
      <Icon className="icon" aria-hidden />
      {label}
    </span>
  );
}
