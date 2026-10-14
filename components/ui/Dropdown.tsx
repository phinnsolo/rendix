"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type DropdownItem =
  | { tipo?: "link"; label: string; href: string; icon?: LucideIcon; danger?: boolean }
  | { tipo: "accion"; label: string; onSelect: () => void; icon?: LucideIcon; danger?: boolean; disabled?: boolean }
  | { tipo: "separador" }
  | { tipo: "titulo"; label: string };

interface Props {
  /** Contenido del botón disparador. */
  trigger: ReactNode;
  triggerLabel: string;
  triggerClassName?: string;
  items: DropdownItem[];
  align?: "left" | "right";
  dropUp?: boolean;
}

/** Menú desplegable accesible: Enter/Espacio abre, flechas navegan, Escape cierra. */
export default function Dropdown({ trigger, triggerLabel, triggerClassName = "btn btn-ghost btn-icon btn-sm", items, align = "right", dropUp }: Props) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const primero = raiz.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
    primero?.focus();
    const onDown = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [abierto]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!abierto) return;
    const nodos = [...(raiz.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const i = nodos.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setAbierto(false);
      boton.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nodos[(i + 1) % nodos.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nodos[(i - 1 + nodos.length) % nodos.length]?.focus();
    } else if (e.key === "Tab") {
      setAbierto(false);
    }
  }

  return (
    <div className="dropdown" ref={raiz} onKeyDown={onKeyDown}>
      <button
        ref={boton}
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? `${id}-menu` : undefined}
        aria-label={triggerLabel}
        onClick={() => setAbierto((v) => !v)}
      >
        {trigger}
      </button>
      {abierto && (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-label={triggerLabel}
          className={`dropdown-menu${align === "left" ? " align-left" : ""}${dropUp ? " drop-up" : ""}`}
        >
          {items.map((item, i) => {
            if (item.tipo === "separador") return <div key={i} className="dropdown-sep" role="separator" />;
            if (item.tipo === "titulo")
              return (
                <div key={i} className="dropdown-label">
                  {item.label}
                </div>
              );
            const Icon = item.icon;
            const clase = `dropdown-item${item.danger ? " is-danger" : ""}`;
            if (item.tipo === "accion") {
              return (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  className={clase}
                  disabled={item.disabled}
                  onClick={() => {
                    setAbierto(false);
                    item.onSelect();
                  }}
                >
                  {Icon && <Icon className="icon" aria-hidden />}
                  {item.label}
                </button>
              );
            }
            return (
              <Link key={i} href={item.href} role="menuitem" className={clase} onClick={() => setAbierto(false)}>
                {Icon && <Icon className="icon" aria-hidden />}
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
