const formatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

export function formatFecha(fecha: Date | string | null | undefined): string {
  if (!fecha) return "—";
  return formatter.format(typeof fecha === "string" ? new Date(fecha) : fecha);
}

export function formatPuntaje(puntaje: number): string {
  return `${puntaje.toLocaleString("es-AR")} ${puntaje === 1 ? "punto" : "puntos"}`;
}

const TZ = "America/Argentina/Buenos_Aires";
const corto = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: TZ });
const hora = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });

/** "15 oct · 10:00" */
export function formatFechaCorta(fecha: Date | string | null | undefined, conHora = true): string {
  if (!fecha) return "—";
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  const dia = corto.format(d).replace(".", "");
  return conHora ? `${dia} · ${hora.format(d)}` : dia;
}

/** "hace 5 min", "hace 3 h", "hace 2 días" (solo en Server Components: depende de la hora actual). */
export function formatRelativo(fecha: Date | string | null | undefined): string {
  if (!fecha) return "—";
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  if (dias < 7) return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
  return formatFechaCorta(d, false);
}

/** "Buenos días" / "Buenas tardes" / "Buenas noches" según la hora de Buenos Aires. */
export function saludo(fecha = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("es-AR", { hour: "numeric", hour12: false, timeZone: TZ }).format(fecha));
  return h >= 5 && h < 12 ? "Buenos días" : h >= 12 && h < 20 ? "Buenas tardes" : "Buenas noches";
}

/** Plural simple: plural(3, "examen", "exámenes") → "3 exámenes". */
export function plural(n: number, singular: string, pluralForma: string): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

export function formatNumero(n: number | null | undefined, decimales = 1): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: decimales });
}

