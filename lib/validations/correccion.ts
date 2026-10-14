import { z } from "zod";

// Corrección de una entrega por parte del profesor (se usa en el formulario y en la API).
export const correccionSchema = z.object({
  correcciones: z
    .array(
      z.object({
        consignaId: z.string().min(1, "Consigna inválida"),
        puntajeObtenido: z
          .number({ error: "El puntaje debe ser un número" })
          .min(0, "El puntaje no puede ser negativo")
          .nullable(),
        feedback: z
          .string()
          .trim()
          .max(5000, "El feedback puede tener hasta 5000 caracteres")
          .nullable()
          .optional()
          .transform((f) => (f ? f : null)),
      }),
      { error: "Las correcciones son inválidas" },
    )
    .max(100)
    .refine(
      (cs) => new Set(cs.map((c) => c.consignaId)).size === cs.length,
      "Hay correcciones repetidas para una misma consigna",
    ),
  feedbackGeneral: z
    .string()
    .trim()
    .max(10000, "El comentario general puede tener hasta 10000 caracteres")
    .nullable()
    .optional()
    .transform((f) => (f ? f : null)),
  /** true = marcar la entrega como CORREGIDA (exige puntaje en todas las consignas). */
  finalizar: z.boolean().default(false),
});

export type CorreccionInput = z.input<typeof correccionSchema>;
