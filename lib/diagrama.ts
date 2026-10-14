import { z } from "zod";

// Estructura de un diagrama (respuesta de consignas tipo DIAGRAMA).
// Se guarda completa en Respuesta.diagrama (JSONB): permite reconstruirlo exactamente,
// reabrirlo en modo lectura y que en el futuro una IA lo interprete
// (figuras con texto + conexiones dirigidas from → to entre figuras).

export const DIAGRAMA_VERSION = 1;

export type TipoFigura = "rectangle" | "circle" | "text";

export interface FiguraDiagrama {
  id: string;
  type: TipoFigura;
  /** Esquina superior izquierda del rectángulo contenedor. */
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

/** Extremo de una conexión: anclado a una figura o libre en el lienzo. */
export type ExtremoConexion = { shapeId: string } | { x: number; y: number };

export interface ConexionDiagrama {
  id: string;
  from: ExtremoConexion;
  to: ExtremoConexion;
  /** Etiqueta opcional de la línea (ej. "Sí" / "No"). */
  label: string;
}

export interface Diagrama {
  version: typeof DIAGRAMA_VERSION;
  shapes: FiguraDiagrama[];
  connections: ConexionDiagrama[];
}

export const MAX_FIGURAS = 300;
export const MAX_CONEXIONES = 600;
export const MIN_TAMANIO = 24;

const coordenada = z.number().min(-100000).max(100000);
const tamanio = z.number().min(10).max(5000);
const id = z.string().min(1).max(64);

const extremoSchema = z.union([
  z.object({ shapeId: id }).strict(),
  z.object({ x: coordenada, y: coordenada }).strict(),
]);

export const diagramaSchema = z
  .object({
    version: z.literal(DIAGRAMA_VERSION),
    shapes: z
      .array(
        z.object({
          id,
          type: z.enum(["rectangle", "circle", "text"]),
          x: coordenada,
          y: coordenada,
          width: tamanio,
          height: tamanio,
          text: z.string().max(500, "El texto de una figura puede tener hasta 500 caracteres"),
        }),
      )
      .max(MAX_FIGURAS, `El diagrama puede tener hasta ${MAX_FIGURAS} figuras`),
    connections: z
      .array(
        z.object({
          id,
          from: extremoSchema,
          to: extremoSchema,
          label: z.string().max(200).default(""),
        }),
      )
      .max(MAX_CONEXIONES, `El diagrama puede tener hasta ${MAX_CONEXIONES} conexiones`),
  })
  .superRefine((d, ctx) => {
    const ids = new Set<string>();
    for (const el of [...d.shapes, ...d.connections]) {
      if (ids.has(el.id)) ctx.addIssue({ code: "custom", message: `Id repetido en el diagrama: ${el.id}` });
      ids.add(el.id);
    }
    const figuras = new Set(d.shapes.map((s) => s.id));
    for (const c of d.connections) {
      for (const e of [c.from, c.to]) {
        if ("shapeId" in e && !figuras.has(e.shapeId)) {
          ctx.addIssue({ code: "custom", message: "Una conexión apunta a una figura inexistente" });
        }
      }
    }
  });

export function diagramaVacio(): Diagrama {
  return { version: DIAGRAMA_VERSION, shapes: [], connections: [] };
}

export function diagramaTieneContenido(d: Diagrama | null | undefined): boolean {
  return Boolean(d && (d.shapes.length > 0 || d.connections.length > 0));
}

/** Acepta cualquier valor (localStorage, JSON de la base) y devuelve un diagrama válido o null. */
export function parsearDiagrama(valor: unknown): Diagrama | null {
  const r = diagramaSchema.safeParse(valor);
  return r.success ? (r.data as Diagrama) : null;
}

// ---------- Geometría ----------

export interface Punto {
  x: number;
  y: number;
}

export function centro(s: FiguraDiagrama): Punto {
  return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
}

/** Punto del borde de la figura en dirección a `hacia` (las líneas no se dibujan dentro de las figuras). */
export function puntoEnBorde(s: FiguraDiagrama, hacia: Punto): Punto {
  const c = centro(s);
  const dx = hacia.x - c.x;
  const dy = hacia.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = s.width / 2;
  const hh = s.height / 2;
  const t =
    s.type === "circle"
      ? 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2)
      : Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  if (t >= 1) return c; // el destino está dentro de la figura
  return { x: c.x + dx * t, y: c.y + dy * t };
}

function referencia(e: ExtremoConexion, figuras: Map<string, FiguraDiagrama>): Punto | null {
  if ("shapeId" in e) {
    const s = figuras.get(e.shapeId);
    return s ? centro(s) : null;
  }
  return { x: e.x, y: e.y };
}

/** Coordenadas reales de una conexión (recortada en el borde de las figuras ancladas). */
export function geometriaConexion(
  c: ConexionDiagrama,
  figuras: Map<string, FiguraDiagrama>,
): { a: Punto; b: Punto } | null {
  const refA = referencia(c.from, figuras);
  const refB = referencia(c.to, figuras);
  if (!refA || !refB) return null;
  const a = "shapeId" in c.from ? puntoEnBorde(figuras.get(c.from.shapeId)!, refB) : refA;
  const b = "shapeId" in c.to ? puntoEnBorde(figuras.get(c.to.shapeId)!, refA) : refB;
  return { a, b };
}

export function contienePunto(s: FiguraDiagrama, p: Punto): boolean {
  if (s.type === "circle") {
    const c = centro(s);
    return ((p.x - c.x) / (s.width / 2)) ** 2 + ((p.y - c.y) / (s.height / 2)) ** 2 <= 1;
  }
  return p.x >= s.x && p.x <= s.x + s.width && p.y >= s.y && p.y <= s.y + s.height;
}

/** Figura visible más arriba (la última dibujada) que contiene el punto. */
export function figuraEnPunto(d: Diagrama, p: Punto, excluir?: string): FiguraDiagrama | null {
  for (let i = d.shapes.length - 1; i >= 0; i--) {
    const s = d.shapes[i];
    if (s.id !== excluir && contienePunto(s, p)) return s;
  }
  return null;
}

/** Rectángulo que contiene todo el diagrama, o null si está vacío. */
export function limitesDiagrama(d: Diagrama): { x: number; y: number; width: number; height: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of d.shapes) {
    xs.push(s.x, s.x + s.width);
    ys.push(s.y, s.y + s.height);
  }
  for (const c of d.connections) {
    for (const e of [c.from, c.to]) {
      if (!("shapeId" in e)) {
        xs.push(e.x);
        ys.push(e.y);
      }
    }
  }
  if (xs.length === 0) return null;
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
