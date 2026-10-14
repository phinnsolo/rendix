import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
  compacto?: boolean;
}

/** Estado vacío: un párrafo entre reglas, con el icono como viñeta entre dos filetes. */
export default function EmptyState({ icon: Icon, titulo, descripcion, accion, compacto }: Props) {
  return (
    <div className={`empty-state${compacto ? " is-compact" : ""}`}>
      <svg className="empty-art" width="132" height="28" viewBox="0 0 132 28" fill="none" aria-hidden>
        <path d="M0 14h46M86 14h46" stroke="currentColor" strokeWidth="1" />
        <circle cx="66" cy="14" r="13" stroke="currentColor" strokeWidth="1" />
        <foreignObject x="57" y="5" width="18" height="18">
          <Icon width={18} height={18} strokeWidth={1.4} />
        </foreignObject>
      </svg>
      <h3>{titulo}</h3>
      {descripcion && <p>{descripcion}</p>}
      {accion}
    </div>
  );
}
