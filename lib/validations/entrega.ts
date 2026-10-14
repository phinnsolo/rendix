import { z } from "zod";
import { diagramaSchema } from "@/lib/diagrama";

export const MAX_RESPUESTA = 20000;
// El estado de GeoGebra es un archivo .ggb en base64; 5 MB es holgado para un examen.
export const MAX_GEOGEBRA_STATE = 5_000_000;

export const entregaSchema = z.object({
  respuestas: z
    .array(
      z.object({
        consignaId: z.string().min(1, "Consigna inválida"),
        // Consignas de DESARROLLO
        texto: z
          .string()
          .max(MAX_RESPUESTA, `Cada respuesta puede tener hasta ${MAX_RESPUESTA} caracteres`)
          .default(""),
        // Consignas de OPCION_MULTIPLE / VERDADERO_FALSO (índice base 0)
        opcion: z.number().int().min(0).nullable().optional(),
        // Consignas de DIAGRAMA (estructura completa)
        diagrama: diagramaSchema.nullable().optional(),
      }),
      { error: "Las respuestas son inválidas" },
    )
    .max(100)
    .refine(
      (rs) => new Set(rs.map((r) => r.consignaId)).size === rs.length,
      "Hay respuestas repetidas para una misma consigna",
    ),
  geogebraState: z
    .string()
    .max(MAX_GEOGEBRA_STATE, "El gráfico de GeoGebra es demasiado grande")
    .regex(/^[A-Za-z0-9+/=]*$/, "El estado de GeoGebra no es válido")
    .nullable()
    .optional(),
});

export type EntregaInput = z.infer<typeof entregaSchema>;

/** Elección de tema en un examen POR_TEMAS. */
export const seleccionTemaSchema = z.object({
  temaId: z.string({ error: "Elegí un tema" }).min(1, "Elegí un tema"),
});
