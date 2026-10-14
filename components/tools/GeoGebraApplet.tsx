"use client";

import { useCallback, useEffect, useId, useRef, useState, type MutableRefObject } from "react";

// Integración de GeoGebra mediante su script oficial de despliegue (deployggb.js).
// El estado del gráfico se maneja como archivo .ggb en base64 (getBase64 / ggbBase64).

const DEPLOY_SCRIPT = "https://www.geogebra.org/apps/deployggb.js";
const TIMEOUT_MS = 20000;

export interface GgbApi {
  getBase64(): string;
  setSize(width: number, height: number): void;
  registerAddListener(fn: () => void): void;
  registerUpdateListener(fn: () => void): void;
  registerRemoveListener(fn: () => void): void;
  registerClearListener(fn: () => void): void;
}

interface GGBAppletInstance {
  inject(containerId: string): void;
}

declare global {
  interface Window {
    GGBApplet?: new (params: Record<string, unknown>, html5NoWebSimple?: boolean) => GGBAppletInstance;
  }
}

let scriptPromise: Promise<void> | null = null;

function cargarScript(): Promise<void> {
  if (typeof window !== "undefined" && window.GGBApplet) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = DEPLOY_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error("No se pudo descargar GeoGebra"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface Props {
  initialState?: string | null;
  readOnly?: boolean;
  height?: number;
  /** Se llama (con debounce) cada vez que el gráfico cambia. */
  onChange?: (base64: string) => void;
  /** Permite al padre leer el estado actual en el momento de enviar. */
  apiRef?: MutableRefObject<GgbApi | null>;
}

export default function GeoGebraApplet({ initialState, readOnly = false, height = 480, onChange, apiRef }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [intento, setIntento] = useState(0);
  const appletId = `ggb${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Estado inicial solo en el primer montaje: el applet se mantiene vivo y conserva su propio estado.
  const initialRef = useRef(initialState);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let cancelado = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let api: GgbApi | null = null;

    // Contenedor manejado por GeoGebra (fuera del árbol de React).
    const host = document.createElement("div");
    host.id = `${appletId}-host-${intento}`;
    wrapper.appendChild(host);

    const timeout = setTimeout(() => {
      if (!cancelado && !api) setEstado("error");
    }, TIMEOUT_MS);

    const onResize = () => {
      if (api && wrapper.clientWidth > 0) api.setSize(wrapper.clientWidth, height);
    };

    cargarScript()
      .then(() => {
        if (cancelado || !window.GGBApplet) return;
        const params: Record<string, unknown> = {
          id: appletId,
          appName: "graphing",
          width: Math.max(wrapper.clientWidth, 300),
          height,
          language: "es",
          showToolBar: !readOnly,
          showAlgebraInput: !readOnly,
          showMenuBar: false,
          showResetIcon: false,
          enableRightClick: !readOnly,
          enableLabelDrags: !readOnly,
          enableUndoRedo: !readOnly,
          enableShiftDragZoom: true,
          showZoomButtons: true,
          useBrowserForJS: false,
          // Sin esto el applet toma el foco al cargar y desplaza la hoja del examen hasta él.
          preventFocus: true,
          borderColor: "#FFFFFF",
          appletOnLoad: (loaded: GgbApi) => {
            if (cancelado) return;
            api = loaded;
            if (apiRef) apiRef.current = loaded;
            setEstado("listo");
            if (!readOnly) {
              const notificar = () => {
                clearTimeout(debounce);
                debounce = setTimeout(() => {
                  try {
                    onChangeRef.current?.(loaded.getBase64());
                  } catch {
                    // El applet pudo haberse desmontado.
                  }
                }, 800);
              };
              loaded.registerAddListener(notificar);
              loaded.registerUpdateListener(notificar);
              loaded.registerRemoveListener(notificar);
              loaded.registerClearListener(notificar);
            }
          },
        };
        if (initialRef.current) params.ggbBase64 = initialRef.current;
        new window.GGBApplet(params, true).inject(host.id);
        window.addEventListener("resize", onResize);
      })
      .catch(() => {
        if (!cancelado) setEstado("error");
      });

    return () => {
      cancelado = true;
      clearTimeout(timeout);
      clearTimeout(debounce);
      window.removeEventListener("resize", onResize);
      if (apiRef) apiRef.current = null;
      host.remove();
    };
  }, [appletId, height, readOnly, apiRef, intento]);

  const reintentar = useCallback(() => {
    setEstado("cargando");
    setIntento((n) => n + 1);
  }, []);

  return (
    <div className="ggb-wrapper" ref={wrapperRef} style={{ minHeight: height }}>
      {estado === "cargando" && (
        <div className="ggb-status">
          <span className="spinner" aria-hidden />
          &nbsp;Cargando GeoGebra...
        </div>
      )}
      {estado === "error" && (
        <div className="ggb-status" style={{ pointerEvents: "auto", flexDirection: "column", gap: "0.5rem" }}>
          <span>No se pudo cargar GeoGebra. Revisá tu conexión.</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reintentar}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
