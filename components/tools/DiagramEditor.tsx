"use client";

import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  centro,
  diagramaVacio,
  figuraEnPunto,
  geometriaConexion,
  limitesDiagrama,
  MIN_TAMANIO,
  type ConexionDiagrama,
  type Diagrama,
  type ExtremoConexion,
  type FiguraDiagrama,
  type Punto,
  type TipoFigura,
} from "@/lib/diagrama";
import {
  Circle,
  Maximize2,
  Minimize2,
  MousePointer2,
  MoveUpRight,
  Redo2,
  Scan,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

// Mini pizarra de diagramación en SVG (sin librerías externas).
// El estado es la estructura del diagrama (figuras + conexiones), no una imagen:
// el mismo componente lo edita (alumno) y lo muestra en modo lectura (profesor).

interface Props {
  /** Valor inicial. El editor maneja su propio estado y avisa cada cambio confirmado con onChange. */
  value?: Diagrama | null;
  onChange?: (diagrama: Diagrama) => void;
  readOnly?: boolean;
  height?: number;
  /** Muestra un botón para ampliar el alto del lienzo (útil al corregir). */
  expandible?: boolean;
}

type Herramienta = "select" | "line";
type Seleccion = { kind: "shape" | "connection"; id: string } | null;
type Esquina = "nw" | "ne" | "sw" | "se";

type Arrastre =
  | { kind: "move"; id: string; start: Punto; orig: Punto; snapshot: Diagrama; moved: boolean }
  | { kind: "resize"; id: string; corner: Esquina; orig: FiguraDiagrama; snapshot: Diagrama; moved: boolean }
  | { kind: "endpoint"; id: string; end: "from" | "to"; snapshot: Diagrama; moved: boolean }
  | { kind: "pan"; startScreen: Punto; origView: Punto; moved: boolean }
  | { kind: "newline"; from: ExtremoConexion; fromPoint: Punto };

interface Historial {
  past: Diagrama[];
  present: Diagrama;
  future: Diagrama[];
}

const MAX_HISTORIAL = 100;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const TAMANIOS: Record<TipoFigura, { w: number; h: number }> = {
  circle: { w: 110, h: 110 },
  rectangle: { w: 150, h: 64 },
  text: { w: 140, h: 40 },
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const redondear = (v: number) => Math.round(v);

function nuevoId(prefijo: "shape" | "connection", d: Diagrama): string {
  const usados = [...d.shapes, ...d.connections]
    .map((e) => Number(e.id.match(new RegExp(`^${prefijo}-(\\d+)$`))?.[1] ?? 0))
    .filter(Number.isFinite);
  return `${prefijo}-${Math.max(0, ...usados) + 1}`;
}

export default function DiagramEditor({ value, onChange, readOnly = false, height = 460, expandible = false }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const textoRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const historial = useRef<Historial>({ past: [], present: value ?? diagramaVacio(), future: [] });
  const ultimoAgrupado = useRef<string | null>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const [, render] = useReducer((n: number) => n + 1, 0);

  const [herramienta, setHerramienta] = useState<Herramienta>("select");
  const [seleccion, setSeleccionState] = useState<Seleccion>(null);
  const [vista, setVista] = useState({ x: 0, y: 0, zoom: 1 });
  const [tamanio, setTamanio] = useState({ w: 800, h: height });
  const [ampliado, setAmpliado] = useState(false);
  const [borrador, setBorrador] = useState<{ a: Punto; b: Punto } | null>(null);
  // Pedido de foco al campo de texto: se resuelve en un efecto, cuando el campo ya está habilitado.
  const [pedidoFoco, setPedidoFoco] = useState(0);
  const ajustado = useRef(false);

  const altura = ampliado ? Math.round(height * 1.7) : height;
  const diagrama = historial.current.present;
  const figuras = new Map(diagrama.shapes.map((s) => [s.id, s]));

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (pedidoFoco === 0) return;
    textoRef.current?.focus();
    textoRef.current?.select();
  }, [pedidoFoco]);

  const setSeleccion = useCallback((s: Seleccion) => {
    ultimoAgrupado.current = null;
    setSeleccionState(s);
  }, []);

  // ---------- Historial (deshacer / rehacer) ----------

  /** Cambio visual durante un arrastre: no entra al historial ni se notifica todavía. */
  function aplicarTransitorio(next: Diagrama) {
    historial.current = { ...historial.current, present: next };
    render();
  }

  /** Cambio confirmado: entra al historial y se notifica (guardado automático del examen). */
  function confirmar(next: Diagrama, desde?: Diagrama, agrupar?: string) {
    const h = historial.current;
    if (agrupar && ultimoAgrupado.current === agrupar) {
      historial.current = { past: h.past, present: next, future: [] };
    } else {
      historial.current = { past: [...h.past, desde ?? h.present].slice(-MAX_HISTORIAL), present: next, future: [] };
    }
    ultimoAgrupado.current = agrupar ?? null;
    render();
    onChangeRef.current?.(next);
  }

  function deshacer() {
    const h = historial.current;
    if (h.past.length === 0) return;
    const previo = h.past[h.past.length - 1];
    historial.current = { past: h.past.slice(0, -1), present: previo, future: [h.present, ...h.future] };
    ultimoAgrupado.current = null;
    render();
    onChangeRef.current?.(previo);
  }

  function rehacer() {
    const h = historial.current;
    if (h.future.length === 0) return;
    const [siguiente, ...resto] = h.future;
    historial.current = { past: [...h.past, h.present], present: siguiente, future: resto };
    ultimoAgrupado.current = null;
    render();
    onChangeRef.current?.(siguiente);
  }

  // Si deshacer/rehacer elimina el elemento seleccionado, se limpia la selección.
  const seleccionValida =
    seleccion &&
    (seleccion.kind === "shape"
      ? diagrama.shapes.some((s) => s.id === seleccion.id)
      : diagrama.connections.some((c) => c.id === seleccion.id))
      ? seleccion
      : null;

  // ---------- Vista (zoom / desplazamiento) ----------

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const medir = () => {
      const r = svg.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setTamanio({ w: r.width, h: r.height });
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  const ajustar = useCallback(() => {
    const b = limitesDiagrama(historial.current.present);
    if (!b) {
      setVista({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const pad = 40;
    const zoom = clamp(Math.min(tamanio.w / (b.width + pad * 2), tamanio.h / (b.height + pad * 2)), ZOOM_MIN, 1.5);
    setVista({ zoom, x: b.x + b.width / 2 - tamanio.w / (2 * zoom), y: b.y + b.height / 2 - tamanio.h / (2 * zoom) });
  }, [tamanio]);

  // Al abrir un diagrama existente se centra en pantalla.
  useEffect(() => {
    if (ajustado.current) return;
    ajustado.current = true;
    if (limitesDiagrama(historial.current.present)) ajustar();
  }, [ajustar]);

  const zoomEn = useCallback(
    (factor: number, ancla?: Punto) => {
      setVista((v) => {
        const zoom = clamp(v.zoom * factor, ZOOM_MIN, ZOOM_MAX);
        const a = ancla ?? { x: tamanio.w / 2, y: tamanio.h / 2 };
        const wx = a.x / v.zoom + v.x;
        const wy = a.y / v.zoom + v.y;
        return { zoom, x: wx - a.x / zoom, y: wy - a.y / zoom };
      });
    },
    [tamanio],
  );

  // Ctrl + rueda = zoom (la rueda sola sigue desplazando la página del examen).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomEn(e.deltaY < 0 ? 1.15 : 1 / 1.15, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomEn]);

  function aMundo(e: { clientX: number; clientY: number }): Punto {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / vista.zoom + vista.x, y: (e.clientY - r.top) / vista.zoom + vista.y };
  }

  // ---------- Edición ----------

  function agregarFigura(type: TipoFigura) {
    const { w, h } = TAMANIOS[type];
    const desfase = (diagrama.shapes.length % 6) * 16;
    const c = { x: vista.x + tamanio.w / 2 / vista.zoom, y: vista.y + tamanio.h / 2 / vista.zoom };
    const figura: FiguraDiagrama = {
      id: nuevoId("shape", diagrama),
      type,
      x: redondear(c.x - w / 2 + desfase),
      y: redondear(c.y - h / 2 + desfase),
      width: w,
      height: h,
      text: type === "text" ? "Texto" : "",
    };
    confirmar({ ...diagrama, shapes: [...diagrama.shapes, figura] });
    setHerramienta("select");
    setSeleccion({ kind: "shape", id: figura.id });
    setPedidoFoco((n) => n + 1);
  }

  function eliminarSeleccion() {
    if (!seleccionValida) return;
    const { kind, id } = seleccionValida;
    const next: Diagrama =
      kind === "shape"
        ? {
            ...diagrama,
            shapes: diagrama.shapes.filter((s) => s.id !== id),
            // Las líneas conectadas a la figura se eliminan con ella.
            connections: diagrama.connections.filter(
              (c) => !("shapeId" in c.from && c.from.shapeId === id) && !("shapeId" in c.to && c.to.shapeId === id),
            ),
          }
        : { ...diagrama, connections: diagrama.connections.filter((c) => c.id !== id) };
    confirmar(next);
    setSeleccion(null);
  }

  function cambiarTexto(texto: string) {
    if (!seleccionValida) return;
    const { kind, id } = seleccionValida;
    const next: Diagrama =
      kind === "shape"
        ? { ...diagrama, shapes: diagrama.shapes.map((s) => (s.id === id ? { ...s, text: texto } : s)) }
        : { ...diagrama, connections: diagrama.connections.map((c) => (c.id === id ? { ...c, label: texto } : c)) };
    confirmar(next, undefined, `texto:${id}`);
  }

  function moverFigura(id: string, dx: number, dy: number) {
    confirmar(
      { ...diagrama, shapes: diagrama.shapes.map((s) => (s.id === id ? { ...s, x: s.x + dx, y: s.y + dy } : s)) },
      undefined,
      `mover:${id}`,
    );
  }

  // ---------- Puntero ----------

  function capturar(e: ReactPointerEvent) {
    try {
      svgRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // eventos sintéticos sin puntero activo
    }
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    wrapperRef.current?.focus({ preventScroll: true });
    const p = aMundo(e);
    const objetivo = (e.target as Element).closest("[data-kind]");
    const kind = objetivo?.getAttribute("data-kind");
    const id = objetivo?.getAttribute("data-id") ?? "";
    capturar(e);

    if (readOnly) {
      arrastre.current = { kind: "pan", startScreen: { x: e.clientX, y: e.clientY }, origView: vista, moved: false };
      return;
    }

    if (herramienta === "line") {
      const s = figuraEnPunto(diagrama, p);
      const fromPoint = s ? centro(s) : p;
      arrastre.current = {
        kind: "newline",
        from: s ? { shapeId: s.id } : { x: redondear(p.x), y: redondear(p.y) },
        fromPoint,
      };
      setBorrador({ a: fromPoint, b: p });
      return;
    }

    if (kind === "handle") {
      const figura = figuras.get(id);
      if (!figura) return;
      arrastre.current = {
        kind: "resize",
        id,
        corner: objetivo!.getAttribute("data-corner") as Esquina,
        orig: figura,
        snapshot: diagrama,
        moved: false,
      };
    } else if (kind === "endpoint") {
      arrastre.current = {
        kind: "endpoint",
        id,
        end: objetivo!.getAttribute("data-end") as "from" | "to",
        snapshot: diagrama,
        moved: false,
      };
    } else if (kind === "shape") {
      const figura = figuras.get(id);
      if (!figura) return;
      setSeleccion({ kind: "shape", id });
      arrastre.current = { kind: "move", id, start: p, orig: { x: figura.x, y: figura.y }, snapshot: diagrama, moved: false };
    } else if (kind === "connection") {
      setSeleccion({ kind: "connection", id });
      arrastre.current = null;
    } else {
      setSeleccion(null);
      arrastre.current = { kind: "pan", startScreen: { x: e.clientX, y: e.clientY }, origView: vista, moved: false };
    }
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const a = arrastre.current;
    if (!a) return;
    const p = aMundo(e);
    const diagrama = historial.current.present;
    switch (a.kind) {
      case "move": {
        const dx = p.x - a.start.x;
        const dy = p.y - a.start.y;
        if (!a.moved && Math.abs(dx) + Math.abs(dy) < 2 / vista.zoom) return;
        a.moved = true;
        aplicarTransitorio({
          ...diagrama,
          shapes: diagrama.shapes.map((s) =>
            s.id === a.id ? { ...s, x: redondear(a.orig.x + dx), y: redondear(a.orig.y + dy) } : s,
          ),
        });
        break;
      }
      case "resize": {
        const o = a.orig;
        let x1 = o.x;
        let y1 = o.y;
        let x2 = o.x + o.width;
        let y2 = o.y + o.height;
        if (a.corner.includes("w")) x1 = Math.min(p.x, x2 - MIN_TAMANIO);
        if (a.corner.includes("e")) x2 = Math.max(p.x, x1 + MIN_TAMANIO);
        if (a.corner.includes("n")) y1 = Math.min(p.y, y2 - MIN_TAMANIO);
        if (a.corner.includes("s")) y2 = Math.max(p.y, y1 + MIN_TAMANIO);
        a.moved = true;
        aplicarTransitorio({
          ...diagrama,
          shapes: diagrama.shapes.map((s) =>
            s.id === a.id
              ? { ...s, x: redondear(x1), y: redondear(y1), width: redondear(x2 - x1), height: redondear(y2 - y1) }
              : s,
          ),
        });
        break;
      }
      case "endpoint": {
        a.moved = true;
        aplicarTransitorio({
          ...diagrama,
          connections: diagrama.connections.map((c) =>
            c.id === a.id ? { ...c, [a.end]: { x: redondear(p.x), y: redondear(p.y) } } : c,
          ),
        });
        break;
      }
      case "pan": {
        const dx = e.clientX - a.startScreen.x;
        const dy = e.clientY - a.startScreen.y;
        if (!a.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        a.moved = true;
        setVista((v) => ({ ...v, x: a.origView.x - dx / v.zoom, y: a.origView.y - dy / v.zoom }));
        break;
      }
      case "newline":
        setBorrador({ a: a.fromPoint, b: p });
        break;
    }
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a) return;
    const p = aMundo(e);
    const diagrama = historial.current.present;

    if ((a.kind === "move" || a.kind === "resize") && a.moved) {
      confirmar(diagrama, a.snapshot);
    } else if (a.kind === "endpoint" && a.moved) {
      // Si el extremo se suelta sobre una figura, la línea queda anclada a ella.
      const conexion = a.snapshot.connections.find((c) => c.id === a.id);
      const otro = conexion?.[a.end === "from" ? "to" : "from"];
      const s = figuraEnPunto(diagrama, p, otro && "shapeId" in otro ? otro.shapeId : undefined);
      const extremo: ExtremoConexion = s ? { shapeId: s.id } : { x: redondear(p.x), y: redondear(p.y) };
      confirmar(
        { ...diagrama, connections: diagrama.connections.map((c) => (c.id === a.id ? { ...c, [a.end]: extremo } : c)) },
        a.snapshot,
      );
    } else if (a.kind === "newline") {
      setBorrador(null);
      const s = figuraEnPunto(diagrama, p);
      const mismaFigura = s && "shapeId" in a.from && a.from.shapeId === s.id;
      const muyCorta = Math.hypot(p.x - a.fromPoint.x, p.y - a.fromPoint.y) < 12 / vista.zoom;
      if (mismaFigura || (muyCorta && !s)) return;
      const conexion: ConexionDiagrama = {
        id: nuevoId("connection", diagrama),
        from: a.from,
        to: s ? { shapeId: s.id } : { x: redondear(p.x), y: redondear(p.y) },
        label: "",
      };
      confirmar({ ...diagrama, connections: [...diagrama.connections, conexion] });
      setSeleccion({ kind: "connection", id: conexion.id });
    }
  }

  function onDoubleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (readOnly) return;
    const objetivo = (e.target as Element).closest("[data-kind='shape'], [data-kind='connection']");
    if (!objetivo) return;
    const kind = objetivo.getAttribute("data-kind") as "shape" | "connection";
    setSeleccion({ kind, id: objetivo.getAttribute("data-id") ?? "" });
    setPedidoFoco((n) => n + 1);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (readOnly) return;
    const enCampo = (e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA";
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") {
      setHerramienta("select");
      setSeleccion(null);
      setBorrador(null);
      arrastre.current = null;
      if (enCampo) wrapperRef.current?.focus();
      return;
    }
    if (enCampo) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      eliminarSeleccion();
    } else if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) rehacer();
      else deshacer();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      rehacer();
    } else if (seleccionValida?.kind === "shape" && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const paso = e.shiftKey ? 20 : 5;
      const d = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
      if (d) moverFigura(seleccionValida.id, d[0], d[1]);
    }
  }

  // ---------- Render ----------

  const k = 1 / vista.zoom; // tamaño constante en pantalla para controles
  const figuraSel = seleccionValida?.kind === "shape" ? figuras.get(seleccionValida.id) : undefined;
  const conexionSel =
    seleccionValida?.kind === "connection" ? diagrama.connections.find((c) => c.id === seleccionValida.id) : undefined;
  const textoSel = figuraSel?.text ?? conexionSel?.label ?? "";
  const h = historial.current;

  const zoomControles = (
    <div className="diagram-group" role="group" aria-label="Zoom">
      <button type="button" className="diagram-btn is-icon" onClick={() => zoomEn(1 / 1.2)} aria-label="Alejar" data-tooltip="Alejar">
        <ZoomOut className="icon" aria-hidden />
      </button>
      <button
        type="button"
        className="diagram-btn diagram-zoom tabular"
        onClick={() => setVista((v) => ({ ...v, zoom: 1 }))}
        data-tooltip="Zoom al 100%"
        aria-label="Zoom al 100%"
      >
        {Math.round(vista.zoom * 100)}%
      </button>
      <button type="button" className="diagram-btn is-icon" onClick={() => zoomEn(1.2)} aria-label="Acercar" data-tooltip="Acercar">
        <ZoomIn className="icon" aria-hidden />
      </button>
      <button type="button" className="diagram-btn is-icon" onClick={ajustar} aria-label="Ajustar" data-tooltip="Ver el diagrama completo">
        <Scan className="icon" aria-hidden />
      </button>
      {expandible && (
        <button type="button" className="diagram-btn is-icon" onClick={() => setAmpliado((v) => !v)} aria-label={ampliado ? "Reducir" : "Ampliar"} data-tooltip={ampliado ? "Reducir lienzo" : "Ampliar lienzo"}>
          {ampliado ? <Minimize2 className="icon" aria-hidden /> : <Maximize2 className="icon" aria-hidden />}
        </button>
      )}
    </div>
  );

  return (
    <div
      className={`diagram${readOnly ? " diagram-readonly" : ""}`}
      ref={wrapperRef}
      tabIndex={readOnly ? undefined : 0}
      onKeyDown={onKeyDown}
      data-testid="diagram-editor"
    >
      <div className="diagram-toolbar" role="toolbar" aria-label="Herramientas del diagrama">
        {!readOnly && (
          <>
            <div className="diagram-group" role="group" aria-label="Elementos">
              <button
                type="button"
                className="diagram-btn"
                aria-pressed={herramienta === "select"}
                onClick={() => setHerramienta("select")}
                aria-label="Seleccionar"
                data-tooltip="Seleccionar y mover (Esc)"
              >
                <MousePointer2 className="icon" aria-hidden />
                <span className="diagram-btn-label">Cursor</span>
              </button>
              <span className="diagram-sep" aria-hidden />
              <button type="button" className="diagram-btn" onClick={() => agregarFigura("circle")} aria-label="Círculo (nodo)" data-tooltip="Agregar nodo circular">
                <Circle className="icon" aria-hidden />
                <span className="diagram-btn-label">Nodo</span>
              </button>
              <button type="button" className="diagram-btn" onClick={() => agregarFigura("rectangle")} aria-label="Rectángulo" data-tooltip="Agregar rectángulo">
                <Square className="icon" aria-hidden />
                <span className="diagram-btn-label">Rectángulo</span>
              </button>
              <button
                type="button"
                className="diagram-btn"
                aria-pressed={herramienta === "line"}
                onClick={() => {
                  setHerramienta((t) => (t === "line" ? "select" : "line"));
                  setSeleccion(null);
                }}
                aria-label="Línea (conector)"
                data-tooltip="Arrastrá desde una figura hasta otra"
              >
                <MoveUpRight className="icon" aria-hidden />
                <span className="diagram-btn-label">Conector</span>
              </button>
              <button type="button" className="diagram-btn" onClick={() => agregarFigura("text")} aria-label="Texto" data-tooltip="Agregar texto libre">
                <Type className="icon" aria-hidden />
                <span className="diagram-btn-label">Texto</span>
              </button>
            </div>
            <div className="diagram-group" role="group" aria-label="Edición">
              <button type="button" className="diagram-btn is-icon" onClick={deshacer} disabled={h.past.length === 0} aria-label="Deshacer" data-tooltip="Deshacer (Ctrl+Z)">
                <Undo2 className="icon" aria-hidden />
              </button>
              <button type="button" className="diagram-btn is-icon" onClick={rehacer} disabled={h.future.length === 0} aria-label="Rehacer" data-tooltip="Rehacer (Ctrl+Y)">
                <Redo2 className="icon" aria-hidden />
              </button>
              <button
                type="button"
                className="diagram-btn is-icon is-danger"
                onClick={eliminarSeleccion}
                disabled={!seleccionValida}
                aria-label="Eliminar"
                data-tooltip="Eliminar selección (Supr)"
              >
                <Trash2 className="icon" aria-hidden />
              </button>
            </div>
          </>
        )}
        {zoomControles}
      </div>

      {!readOnly && (
        <div className="diagram-props">
          <label htmlFor={`${uid}-texto`} className="small">
            {conexionSel ? "Etiqueta de la línea" : "Texto de la figura"}
          </label>
          <input
            id={`${uid}-texto`}
            ref={textoRef}
            className="input input-sm"
            value={textoSel}
            onChange={(e) => cambiarTexto(e.target.value)}
            disabled={!figuraSel && !conexionSel}
            maxLength={conexionSel ? 200 : 500}
            placeholder={figuraSel || conexionSel ? "Escribí el texto..." : "Seleccioná una figura o línea para editar su texto"}
          />
        </div>
      )}

      <svg
        ref={svgRef}
        className={`diagram-canvas tool-${herramienta}`}
        style={{ height: altura }}
        role={readOnly ? "img" : "application"}
        aria-label={
          readOnly
            ? `Diagrama con ${diagrama.shapes.length} figuras y ${diagrama.connections.length} conexiones`
            : "Lienzo del diagrama"
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <defs>
          <pattern id={`${uid}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" className="diagram-grid" />
          </pattern>
          <marker
            id={`${uid}-flecha`}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="9"
            markerHeight="9"
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className="diagram-arrow" />
          </marker>
        </defs>
        <g transform={`scale(${vista.zoom}) translate(${-vista.x} ${-vista.y})`}>
          <rect
            x={vista.x}
            y={vista.y}
            width={tamanio.w / vista.zoom}
            height={altura / vista.zoom}
            fill={`url(#${uid}-grid)`}
          />

          {diagrama.connections.map((c) => {
            const g = geometriaConexion(c, figuras);
            if (!g) return null;
            const sel = conexionSel?.id === c.id;
            const medio = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
            return (
              <g key={c.id} data-kind="connection" data-id={c.id} data-testid={`connection-${c.id}`}>
                <line x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} className="diagram-hit" />
                <line
                  x1={g.a.x}
                  y1={g.a.y}
                  x2={g.b.x}
                  y2={g.b.y}
                  className={`diagram-line${sel ? " selected" : ""}`}
                  markerEnd={`url(#${uid}-flecha)`}
                />
                {c.label && (
                  <text x={medio.x} y={medio.y} className="diagram-label" textAnchor="middle" dominantBaseline="middle">
                    {c.label}
                  </text>
                )}
              </g>
            );
          })}

          {diagrama.shapes.map((s) => {
            const sel = figuraSel?.id === s.id;
            const clase = `diagram-shape diagram-shape-${s.type}${sel ? " selected" : ""}`;
            return (
              <g key={s.id} data-kind="shape" data-id={s.id} data-testid={`shape-${s.id}`} className="diagram-shape-group">
                {s.type === "circle" ? (
                  <ellipse cx={s.x + s.width / 2} cy={s.y + s.height / 2} rx={s.width / 2} ry={s.height / 2} className={clase} />
                ) : (
                  <rect x={s.x} y={s.y} width={s.width} height={s.height} rx={s.type === "rectangle" ? 6 : 0} className={clase} />
                )}
                <foreignObject x={s.x} y={s.y} width={s.width} height={s.height} pointerEvents="none">
                  <div className={`diagram-text${s.type === "text" ? " diagram-text-free" : ""}`}>{s.text}</div>
                </foreignObject>
              </g>
            );
          })}

          {borrador && (
            <line
              x1={borrador.a.x}
              y1={borrador.a.y}
              x2={borrador.b.x}
              y2={borrador.b.y}
              className="diagram-line diagram-draft"
              markerEnd={`url(#${uid}-flecha)`}
            />
          )}

          {!readOnly &&
            figuraSel &&
            (["nw", "ne", "sw", "se"] as Esquina[]).map((corner) => (
              <rect
                key={corner}
                data-kind="handle"
                data-id={figuraSel.id}
                data-corner={corner}
                x={(corner.includes("w") ? figuraSel.x : figuraSel.x + figuraSel.width) - 5 * k}
                y={(corner.includes("n") ? figuraSel.y : figuraSel.y + figuraSel.height) - 5 * k}
                width={10 * k}
                height={10 * k}
                className={`diagram-handle handle-${corner}`}
              />
            ))}

          {!readOnly &&
            conexionSel &&
            (() => {
              const g = geometriaConexion(conexionSel, figuras);
              if (!g) return null;
              return (["from", "to"] as const).map((end) => {
                const pt = end === "from" ? g.a : g.b;
                return (
                  <circle
                    key={end}
                    data-kind="endpoint"
                    data-id={conexionSel.id}
                    data-end={end}
                    cx={pt.x}
                    cy={pt.y}
                    r={7 * k}
                    className="diagram-endpoint"
                  />
                );
              });
            })()}
        </g>
      </svg>

      {!readOnly && (
        <p className="diagram-hint xsmall muted">
          {herramienta === "line"
            ? "Línea: arrastrá desde una figura hasta otra para conectarlas. Esc para terminar."
            : "Arrastrá las figuras para moverlas y las esquinas para cambiar su tamaño. Seleccioná una línea para mover sus extremos. Arrastrá el fondo para desplazarte; Ctrl + rueda para hacer zoom."}
        </p>
      )}
    </div>
  );
}
