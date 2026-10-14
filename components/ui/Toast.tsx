"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

type Tipo = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tipo: Tipo;
  mensaje: string;
  saliendo?: boolean;
}

interface ToastApi {
  mostrar: (mensaje: string, tipo?: Tipo) => void;
  exito: (mensaje: string) => void;
  error: (mensaje: string) => void;
  info: (mensaje: string) => void;
}

const noop: ToastApi = { mostrar: () => {}, exito: () => {}, error: () => {}, info: () => {} };
const ToastContext = createContext<ToastApi>(noop);

const DURACION = 4000;
const ICONOS = { success: CircleCheck, error: CircleAlert, info: Info };

/** Notificaciones efímeras. Sin provider (ej. en tests) el hook es un no-op seguro. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const siguiente = useRef(1);

  const cerrar = useCallback((id: number) => {
    setItems((ts) => ts.map((t) => (t.id === id ? { ...t, saliendo: true } : t)));
    window.setTimeout(() => setItems((ts) => ts.filter((t) => t.id !== id)), 200);
  }, []);

  const mostrar = useCallback(
    (mensaje: string, tipo: Tipo = "success") => {
      const id = siguiente.current++;
      setItems((ts) => [...ts.slice(-3), { id, tipo, mensaje }]);
      window.setTimeout(() => cerrar(id), DURACION);
    },
    [cerrar],
  );

  const api = useMemo<ToastApi>(
    () => ({
      mostrar,
      exito: (m) => mostrar(m, "success"),
      error: (m) => mostrar(m, "error"),
      info: (m) => mostrar(m, "info"),
    }),
    [mostrar],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {items.map((t) => {
          const Icono = ICONOS[t.tipo];
          return (
            <div key={t.id} className={`toast toast-${t.tipo}${t.saliendo ? " is-leaving" : ""}`} role={t.tipo === "error" ? "alert" : "status"}>
              <Icono className="icon" aria-hidden />
              <span className="toast-msg">{t.mensaje}</span>
              <button type="button" className="toast-close" onClick={() => cerrar(t.id)} aria-label="Cerrar notificación">
                <X size={15} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Muestra un toast una sola vez al llegar a una página (ej. "?guardado=1") y limpia
 * el parámetro de la URL para que no se repita al refrescar.
 */
export function FlashToast({ mensaje, parametro, tipo = "success" }: { mensaje: string; parametro: string; tipo?: Tipo }) {
  const { mostrar } = useToast();
  const mostrado = useRef(false);
  useEffect(() => {
    if (mostrado.current) return;
    mostrado.current = true;
    mostrar(mensaje, tipo);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(parametro);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch {
      /* ignorar */
    }
  }, [mensaje, parametro, tipo, mostrar]);
  return null;
}
