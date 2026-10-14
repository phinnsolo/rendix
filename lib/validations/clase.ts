import { z } from "zod";

// Clases (comisiones) del profesor: se usan en los formularios y en las APIs.

export const claseSchema = z.object({
  nombre: z
    .string({ error: "El nombre de la clase es obligatorio" })
    .trim()
    .min(1, "El nombre de la clase es obligatorio")
    .max(100, "El nombre puede tener hasta 100 caracteres"),
  descripcion: z
    .string()
    .trim()
    .max(1000, "La descripción puede tener hasta 1000 caracteres")
    .nullable()
    .optional()
    .transform((d) => (d ? d : null)),
});

export type ClaseInput = z.input<typeof claseSchema>;

export const inscripcionSchema = z.object({
  alumnoId: z.string({ error: "Elegí un alumno" }).min(1, "Elegí un alumno"),
});
