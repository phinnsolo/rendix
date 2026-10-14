import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, CircleAlert } from "lucide-react";

// Piezas pequeñas de UI sin estado: ProgressBar, UserAvatar, Skeleton, PageHeader, Field, Tooltip.

export function ProgressBar({
  valor,
  maximo = 100,
  etiqueta,
  tono = "primary",
  tamanio = "md",
}: {
  valor: number;
  maximo?: number;
  etiqueta: string;
  tono?: "primary" | "success" | "accent";
  tamanio?: "sm" | "md";
}) {
  const pct = maximo > 0 ? Math.max(0, Math.min(100, (valor / maximo) * 100)) : 0;
  return (
    <div
      className={`progress${tamanio === "sm" ? " progress-sm" : ""}`}
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={maximo}
      aria-valuenow={valor}
    >
      <div className={`progress-bar${tono !== "primary" ? ` is-${tono}` : ""}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
}

function tono(nombre: string): number {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 4) + 1;
}

export function UserAvatar({ nombre, tamanio = "md" }: { nombre: string; tamanio?: "sm" | "md" | "lg" }) {
  return (
    <span className={`avatar${tamanio !== "md" ? ` avatar-${tamanio}` : ""}`} data-tone={tono(nombre)} aria-hidden>
      {iniciales(nombre)}
    </span>
  );
}

export function Skeleton({ width, height = 12, radius, style }: { width?: number | string; height?: number | string; radius?: number; style?: React.CSSProperties }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius, ...style }} aria-hidden />;
}

export function PageHeader({
  titulo,
  subtitulo,
  eyebrow,
  acciones,
  volver,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  eyebrow?: ReactNode;
  acciones?: ReactNode;
  volver?: { href: string; label: string };
}) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {volver && (
          <Link href={volver.href} className="back-link">
            <ArrowLeft className="icon" aria-hidden />
            {volver.label}
          </Link>
        )}
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{titulo}</h1>
        {subtitulo && <p className="page-subtitle">{subtitulo}</p>}
      </div>
      {acciones && <div className="page-actions">{acciones}</div>}
    </header>
  );
}

export function Field({
  id,
  label,
  requerido,
  opcional,
  ayuda,
  error,
  children,
}: {
  id?: string;
  label: ReactNode;
  requerido?: boolean;
  opcional?: boolean;
  ayuda?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
        {requerido && (
          <span className="req" aria-hidden>
            *
          </span>
        )}
        {opcional && <span className="label-optional">(opcional)</span>}
      </label>
      {children}
      {error ? <FieldError mensaje={error} /> : ayuda ? <span className="field-help">{ayuda}</span> : null}
    </div>
  );
}

export function FieldError({ mensaje, id }: { mensaje: string; id?: string }) {
  return (
    <span className="field-error" id={id}>
      <CircleAlert className="icon" aria-hidden />
      {mensaje}
    </span>
  );
}
