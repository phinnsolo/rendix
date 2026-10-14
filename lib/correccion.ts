// Corrección automática por tipo de consigna.
//
// Diseño preparado para IA: toda corrección no humana produce una *sugerencia*
// (puntaje + detalle + fuente) que se guarda en Respuesta.puntajeSugerido/fuenteSugerencia.
// La nota final (Respuesta.puntajeObtenido) solo la escribe el profesor al guardar la corrección.
// Un futuro corrector con IA implementa la misma interfaz `Sugerencia` con fuente "IA".

export type TipoConsigna = "DESARROLLO" | "OPCION_MULTIPLE" | "VERDADERO_FALSO" | "DIAGRAMA";
export type FuenteSugerencia = "AUTOMATICA" | "IA";

export interface Sugerencia {
  puntaje: number;
  fuente: FuenteSugerencia;
  detalle: string;
}

interface ConsignaCorregible {
  tipo: TipoConsigna;
  puntaje: number;
  opciones: string[];
  respuestaCorrecta: number | null;
}

export const TIPOS_AUTOCORREGIBLES: TipoConsigna[] = ["OPCION_MULTIPLE", "VERDADERO_FALSO"];

export function esAutocorregible(tipo: TipoConsigna): boolean {
  return TIPOS_AUTOCORREGIBLES.includes(tipo);
}

/** Devuelve la sugerencia automática, o null si el tipo requiere corrección manual. */
export function corregirAutomaticamente(
  consigna: ConsignaCorregible,
  respuesta: { opcionSeleccionada: number | null },
): Sugerencia | null {
  if (!esAutocorregible(consigna.tipo) || consigna.respuestaCorrecta === null) return null;
  const correcta = consigna.opciones[consigna.respuestaCorrecta] ?? `opción ${consigna.respuestaCorrecta + 1}`;
  if (respuesta.opcionSeleccionada === null) {
    return { puntaje: 0, fuente: "AUTOMATICA", detalle: `Sin responder. Respuesta correcta: "${correcta}".` };
  }
  const elegida = consigna.opciones[respuesta.opcionSeleccionada] ?? `opción ${respuesta.opcionSeleccionada + 1}`;
  const acierto = respuesta.opcionSeleccionada === consigna.respuestaCorrecta;
  return {
    puntaje: acierto ? consigna.puntaje : 0,
    fuente: "AUTOMATICA",
    detalle: acierto
      ? `Correcta: eligió "${elegida}".`
      : `Incorrecta: eligió "${elegida}". Respuesta correcta: "${correcta}".`,
  };
}

/** Nota total = suma de los puntajes asignados por el profesor (null si todavía no hay ninguno). */
export function calcularNotaTotal(puntajes: (number | null)[]): number | null {
  const asignados = puntajes.filter((p): p is number => p !== null);
  if (asignados.length === 0) return null;
  return Math.round(asignados.reduce((a, b) => a + b, 0) * 100) / 100;
}

export const ETIQUETAS_TIPO: Record<TipoConsigna, string> = {
  DESARROLLO: "Desarrollo",
  OPCION_MULTIPLE: "Opción múltiple",
  VERDADERO_FALSO: "Verdadero / Falso",
  DIAGRAMA: "Diagrama",
};

export const OPCIONES_VF = ["Verdadero", "Falso"];
