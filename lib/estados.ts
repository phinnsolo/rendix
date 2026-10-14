// Estados de presentación derivados de los datos reales (no se guardan en la base).
// El modelo solo conoce BORRADOR/PUBLICADO para exámenes y EN_CURSO/ENTREGADO/EN_CORRECCION/CORREGIDO
// para entregas; la UI los combina para que el profesor vea de un vistazo qué requiere atención.

export type EstadoExamenUI = "BORRADOR" | "ACTIVO" | "PENDIENTE_CORRECCION" | "FINALIZADO";
export type EstadoEntregaUI = "NO_ENTREGADO" | "EN_CURSO" | "PENDIENTE" | "EN_CORRECCION" | "CORREGIDO";

export function estadoExamenUI(datos: {
  estado: "BORRADOR" | "PUBLICADO";
  asignados: number;
  entregas: number;
  corregidas: number;
}): EstadoExamenUI {
  if (datos.estado === "BORRADOR") return "BORRADOR";
  if (datos.entregas > datos.corregidas) return "PENDIENTE_CORRECCION";
  if (datos.asignados > 0 && datos.entregas >= datos.asignados) return "FINALIZADO";
  return "ACTIVO";
}

export function estadoEntregaUI(
  estado: "EN_CURSO" | "ENTREGADO" | "EN_CORRECCION" | "CORREGIDO" | null,
): EstadoEntregaUI {
  if (estado === null) return "NO_ENTREGADO";
  if (estado === "EN_CURSO") return "EN_CURSO";
  if (estado === "ENTREGADO") return "PENDIENTE";
  return estado;
}

/** Porcentaje del puntaje a partir del cual una entrega se considera aprobada. */
export const UMBRAL_APROBACION = 0.6;

export function aprobado(nota: number, maximo: number): boolean {
  return maximo > 0 && nota / maximo >= UMBRAL_APROBACION;
}

/** Nota normalizada a escala 0–10 (con un decimal). */
export function notaSobre10(nota: number, maximo: number): number {
  if (maximo <= 0) return 0;
  return Math.round((nota / maximo) * 100) / 10;
}
