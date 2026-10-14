"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";

interface Props {
  abierto: boolean;
  titulo: string;
  descripcion?: ReactNode;
  icono?: LucideIcon;
  tono?: "primary" | "danger";
  tamanio?: "md" | "lg";
  /** Si es false, Escape y el fondo no cierran (ej.: mientras se procesa). */
  cerrable?: boolean;
  onCerrar: () => void;
  /** Elemento que recibe el foco al abrir (por defecto, el primer control). */
  focoInicial?: React.RefObject<HTMLElement | null>;
  children?: ReactNode;
  acciones?: ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Modal({
  abierto,
  titulo,
  descripcion,
  icono: Icono,
  tono = "primary",
  tamanio = "md",
  cerrable = true,
  onCerrar,
  focoInicial,
  children,
  acciones,
}: Props) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const onCerrarRef = useRef(onCerrar);
  const cerrableRef = useRef(cerrable);
  useEffect(() => {
    onCerrarRef.current = onCerrar;
    cerrableRef.current = cerrable;
  });

  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    const destino = focoInicial?.current ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    destino?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && cerrableRef.current) {
        e.stopPropagation();
        onCerrarRef.current();
      }
      // Trampa de foco simple: Tab no sale del diálogo.
      if (e.key === "Tab" && ref.current) {
        const nodos = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (nodos.length === 0) return;
        const primero = nodos[0];
        const ultimo = nodos[nodos.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previo?.focus?.();
    };
  }, [abierto, focoInicial]);

  if (!abierto) return null;

  // Portal al <body>: el diálogo nunca queda atrapado en un contexto de apilamiento.
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && cerrable) onCerrar();
      }}
    >
      <div
        ref={ref}
        className={`modal${tamanio === "lg" ? " modal-lg" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={descripcion ? `${id}-desc` : undefined}
      >
        <div className="modal-header">
          {Icono && (
            <span className={`modal-icon${tono === "danger" ? " is-danger" : ""}`} aria-hidden>
              <Icono className="icon" />
            </span>
          )}
          <div className="grow">
            <h2 id={`${id}-titulo`}>{titulo}</h2>
            {descripcion && <p id={`${id}-desc`}>{descripcion}</p>}
          </div>
          {cerrable && (
            <button type="button" className="btn btn-ghost btn-icon btn-sm modal-close" onClick={onCerrar} aria-label="Cerrar">
              <X className="icon" aria-hidden />
            </button>
          )}
        </div>
        {children && <div className="modal-body">{children}</div>}
        {acciones && <div className="modal-actions">{acciones}</div>}
      </div>
    </div>,
    document.body,
  );
}
