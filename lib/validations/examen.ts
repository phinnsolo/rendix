import { z } from "zod";

// Reglas del examen: se usan en el formulario (frontend) y en las APIs (backend).

export const PUNTAJE_MIN = 0;
export const PUNTAJE_MAX = 10;

export const TIPOS_CONSIGNA = ["DESARROLLO", "OPCION_MULTIPLE", "VERDADERO_FALSO", "DIAGRAMA"] as const;
export const MAX_OPCIONES = 10;

// `tipo` es opcional para mantener compatibilidad: {texto, puntaje} sigue siendo una consigna de DESARROLLO.
export const consignaSchema = z
  .object({
    texto: z
      .string({ error: "El texto de la consigna es obligatorio" })
      .trim()
      .min(1, "El texto de la consigna es obligatorio")
      .max(5000, "La consigna no puede superar los 5000 caracteres"),
    puntaje: z
      .number({ error: "El puntaje debe ser un número" })
      .min(PUNTAJE_MIN, `El puntaje debe estar entre ${PUNTAJE_MIN} y ${PUNTAJE_MAX}`)
      .max(PUNTAJE_MAX, `El puntaje debe estar entre ${PUNTAJE_MIN} y ${PUNTAJE_MAX}`),
    tipo: z.enum(TIPOS_CONSIGNA, { error: "Tipo de consigna inválido" }).default("DESARROLLO"),
    opciones: z
      .array(z.string().trim().max(500, "Cada opción puede tener hasta 500 caracteres"), {
        error: "Las opciones son inválidas",
      })
      .max(MAX_OPCIONES, `Hasta ${MAX_OPCIONES} opciones`)
      .default([]),
    respuestaCorrecta: z.number().int().min(0).nullable().default(null),
    criterio: z
      .string()
      .trim()
      .max(5000, "El criterio no puede superar los 5000 caracteres")
      .nullable()
      .default(null)
      .transform((c) => (c ? c : null)),
  })
  .superRefine((c, ctx) => {
    if (c.tipo === "OPCION_MULTIPLE") {
      if (c.opciones.length < 2) {
        ctx.addIssue({ code: "custom", path: ["opciones"], message: "Agregá al menos 2 opciones" });
      }
      c.opciones.forEach((o, i) => {
        if (!o) ctx.addIssue({ code: "custom", path: ["opciones", i], message: "La opción no puede estar vacía" });
      });
      if (c.respuestaCorrecta === null || c.respuestaCorrecta >= c.opciones.length) {
        ctx.addIssue({ code: "custom", path: ["respuestaCorrecta"], message: "Marcá cuál es la opción correcta" });
      }
    }
    if (c.tipo === "VERDADERO_FALSO" && c.respuestaCorrecta !== 0 && c.respuestaCorrecta !== 1) {
      ctx.addIssue({ code: "custom", path: ["respuestaCorrecta"], message: "Indicá si la afirmación es verdadera o falsa" });
    }
  })
  // Normaliza: solo las consignas de opciones guardan opciones y respuesta correcta.
  .transform((c) => {
    if (c.tipo === "VERDADERO_FALSO") return { ...c, opciones: ["Verdadero", "Falso"] };
    if (c.tipo === "OPCION_MULTIPLE") return c;
    return { ...c, opciones: [], respuestaCorrecta: null };
  });

export const herramientasSchema = z.object({
  habilitarEscritura: z.boolean(),
  habilitarCalculadora: z.boolean(),
  habilitarGeoGebra: z.boolean(),
});

export const MODOS_EXAMEN = ["NORMAL", "POR_TEMAS"] as const;
export type ModoExamen = (typeof MODOS_EXAMEN)[number];
export const MAX_TEMAS = 20;
export const MAX_CONSIGNAS = 50;
export const DURACION_MAX_MINUTOS = 1440;

const textoOpcional = (max: number, mensaje: string) =>
  z
    .string()
    .trim()
    .max(max, mensaje)
    .nullable()
    .default(null)
    .transform((t) => (t ? t : null));

/** Tema de un examen POR_TEMAS con sus propias consignas (el orden es el del arreglo). */
export const temaSchema = z.object({
  nombre: z
    .string({ error: "El nombre del tema es obligatorio" })
    .trim()
    .min(1, "El nombre del tema es obligatorio")
    .max(100, "El nombre del tema puede tener hasta 100 caracteres"),
  titulo: textoOpcional(200, "El título del tema puede tener hasta 200 caracteres"),
  descripcion: textoOpcional(2000, "La descripción del tema puede tener hasta 2000 caracteres"),
  consignas: z
    .array(consignaSchema, { error: "Las consignas son obligatorias" })
    .min(1, "El tema debe tener al menos una consigna")
    .max(MAX_CONSIGNAS, `Un tema no puede tener más de ${MAX_CONSIGNAS} consignas`),
});

export type TemaData = z.output<typeof temaSchema>;

const camposExamen = {
  titulo: z
    .string({ error: "El título es obligatorio" })
    .trim()
    .min(1, "El título es obligatorio")
    .max(200, "El título no puede superar los 200 caracteres"),
  enunciado: z
    .string({ error: "El enunciado es obligatorio" })
    .trim()
    .min(1, "El enunciado es obligatorio")
    .max(10000, "El enunciado no puede superar los 10000 caracteres"),
  modo: z.enum(MODOS_EXAMEN, { error: "Modo de examen inválido" }).default("NORMAL"),
  // El orden de las consignas es el orden del arreglo (el servidor asigna 1..n).
  // En modo NORMAL van acá; en modo POR_TEMAS van dentro de cada tema.
  consignas: z
    .array(consignaSchema, { error: "Las consignas son obligatorias" })
    .max(MAX_CONSIGNAS, `El examen no puede tener más de ${MAX_CONSIGNAS} consignas`)
    .default([]),
  temas: z
    .array(temaSchema, { error: "Los temas son inválidos" })
    .max(MAX_TEMAS, `El examen no puede tener más de ${MAX_TEMAS} temas`)
    .default([]),
};

interface Estructura {
  modo: ModoExamen;
  consignas: unknown[];
  temas: { nombre: string }[];
}

/** Reglas de estructura según el modo (compartidas por guardar y publicar). */
function validarEstructura(e: Estructura, ctx: z.RefinementCtx, minimoTemas: number) {
  if (e.modo === "NORMAL") {
    if (e.consignas.length === 0) {
      ctx.addIssue({ code: "custom", path: ["consignas"], message: "El examen debe tener al menos una consigna" });
    }
    if (e.temas.length > 0) {
      ctx.addIssue({ code: "custom", path: ["temas"], message: "Un examen normal no tiene temas" });
    }
    return;
  }
  if (e.consignas.length > 0) {
    ctx.addIssue({ code: "custom", path: ["consignas"], message: "En un examen por temas las consignas van dentro de cada tema" });
  }
  if (e.temas.length < minimoTemas) {
    ctx.addIssue({
      code: "custom",
      path: ["temas"],
      message: minimoTemas === 1 ? "Agregá al menos un tema" : `Un examen por temas necesita al menos ${minimoTemas} temas`,
    });
  }
  const vistos = new Set<string>();
  e.temas.forEach((t, i) => {
    const clave = t.nombre.trim().toLowerCase();
    if (vistos.has(clave)) {
      ctx.addIssue({ code: "custom", path: ["temas", i, "nombre"], message: "Ya hay otro tema con ese nombre" });
    }
    vistos.add(clave);
  });
}

/** Todas las consignas del examen, sin importar el modo. */
export function todasLasConsignas<C>(e: { consignas: C[]; temas: { consignas: C[] }[] }): C[] {
  return [...e.consignas, ...e.temas.flatMap((t) => t.consignas)];
}

/** Body de crear/editar examen (siempre se guarda como BORRADOR). */
export const examenSchema = z
  .object({
    ...camposExamen,
    ...herramientasSchema.shape,
    // Asignación: el examen se asigna a UNA clase del profesor (opcional mientras sea borrador).
    claseId: z.string().min(1, "Clase inválida").nullable().default(null),
    // ISO 8601 con zona horaria. null = disponible apenas se publica.
    fechaDisponible: z.iso.datetime({ offset: true, error: "La fecha y hora no son válidas" }).nullable().default(null),
    duracionMinutos: z
      .number({ error: "La duración debe ser un número de minutos" })
      .int("La duración debe ser un número entero de minutos")
      .min(1, "La duración mínima es 1 minuto")
      .max(DURACION_MAX_MINUTOS, `La duración máxima es ${DURACION_MAX_MINUTOS} minutos`)
      .nullable()
      .default(null),
  })
  .superRefine((e, ctx) => validarEstructura(e, ctx, 1))
  // Un examen tiene que poder resolverse: o hay alguna herramienta, o hay consignas que se
  // responden sin herramientas (opciones o diagrama, que trae su propio editor).
  .refine(
    (e) =>
      e.habilitarEscritura ||
      e.habilitarCalculadora ||
      e.habilitarGeoGebra ||
      todasLasConsignas(e).some((c) => c.tipo !== "DESARROLLO"),
    { message: "Habilitá al menos una herramienta", path: ["herramientas"] },
  );

export type ExamenInput = z.input<typeof examenSchema>;
export type ExamenData = z.output<typeof examenSchema>;

/** Reglas que debe cumplir un examen ya guardado para poder publicarse. */
export const publicacionSchema = z
  .object(camposExamen)
  .superRefine((e, ctx) => validarEstructura(e, ctx, 2));

/** Asignar (o cambiar) la clase de un examen. */
export const asignacionClaseSchema = z.object({
  claseId: z.string({ error: "Elegí una clase" }).min(1, "Elegí una clase"),
});
