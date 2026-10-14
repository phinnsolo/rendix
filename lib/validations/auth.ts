import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string({ error: "Ingresá tu email" })
    .trim()
    .toLowerCase()
    .min(1, "Ingresá tu email")
    .pipe(z.email("El email no tiene un formato válido")),
  password: z.string({ error: "Ingresá tu contraseña" }).min(1, "Ingresá tu contraseña").max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
