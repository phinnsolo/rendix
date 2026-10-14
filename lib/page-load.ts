import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/http";

/** Ejecuta un servicio desde una página: 404 → página "no encontrado", 403 → "acceso denegado". */
export async function cargarOFallar<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError && error.status === 403) redirect("/no-autorizado");
    throw error;
  }
}
