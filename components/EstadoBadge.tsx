import {
  Calculator,
  CircleCheck,
  CircleDashed,
  Clock,
  Hourglass,
  PenLine,
  PencilLine,
  Spline,
  type LucideIcon,
} from "lucide-react";
import type { EstadoEntregaUI, EstadoExamenUI } from "@/lib/estados";

// Los estados se distinguen por icono + forma + texto, nunca solo por color.

interface Def {
  label: string;
  clase: string;
  Icon?: LucideIcon;
  dot?: boolean;
}

const EXAMEN: Record<EstadoExamenUI, Def> = {
  BORRADOR: { label: "Borrador", clase: "status-draft", Icon: CircleDashed },
  ACTIVO: { label: "Activo", clase: "status-active", dot: true },
  PENDIENTE_CORRECCION: { label: "Pendiente de corrección", clase: "status-pending", Icon: Hourglass },
  FINALIZADO: { label: "Finalizado", clase: "status-done", Icon: CircleCheck },
};

const ENTREGA: Record<EstadoEntregaUI, Def> = {
  NO_ENTREGADO: { label: "Sin entregar", clase: "status-draft", Icon: CircleDashed },
  EN_CURSO: { label: "En curso", clase: "status-active", Icon: Clock },
  PENDIENTE: { label: "Pendiente de corrección", clase: "status-pending", Icon: Hourglass },
  EN_CORRECCION: { label: "En corrección", clase: "status-progress", Icon: PencilLine },
  CORREGIDO: { label: "Corregido", clase: "status-done", Icon: CircleCheck },
};

function Status({ def }: { def: Def }) {
  const { label, clase, Icon, dot } = def;
  return (
    <span className={`status ${clase}`}>
      {dot ? <span className="status-dot" aria-hidden /> : Icon && <Icon className="icon" aria-hidden />}
      {label}
    </span>
  );
}

export function ExamStatus({ estado }: { estado: EstadoExamenUI }) {
  return <Status def={EXAMEN[estado]} />;
}

export function EntregaStatus({ estado }: { estado: EstadoEntregaUI }) {
  return <Status def={ENTREGA[estado]} />;
}

/** Estado de corrección de una entrega, tal como se muestra al profesor. */
export function EstadoCorreccionBadge({ estado }: { estado: "ENTREGADO" | "EN_CORRECCION" | "CORREGIDO" }) {
  return <EntregaStatus estado={estado === "ENTREGADO" ? "PENDIENTE" : estado} />;
}

/** Estado de un examen desde el punto de vista del alumno. */
export function AlumnoExamStatus({ entregado }: { entregado: boolean }) {
  return entregado ? (
    <Status def={{ label: "Entregado", clase: "status-done", Icon: CircleCheck }} />
  ) : (
    <Status def={{ label: "Pendiente", clase: "status-active", Icon: Clock }} />
  );
}

const HERRAMIENTAS: { key: "escritura" | "calculadora" | "geogebra"; label: string; Icon: LucideIcon }[] = [
  { key: "escritura", label: "Escritura", Icon: PenLine },
  { key: "calculadora", label: "Calculadora", Icon: Calculator },
  { key: "geogebra", label: "GeoGebra", Icon: Spline },
];

export function HerramientasBadges(props: { escritura: boolean; calculadora: boolean; geogebra: boolean }) {
  const activas = HERRAMIENTAS.filter((h) => props[h.key]);
  if (activas.length === 0) return <span className="muted small">Sin herramientas</span>;
  return (
    <span className="row" style={{ gap: "0.35rem" }}>
      {activas.map(({ key, label, Icon }) => (
        <span key={key} className="badge badge-outline">
          <Icon className="icon" aria-hidden />
          {label}
        </span>
      ))}
    </span>
  );
}
