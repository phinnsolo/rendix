import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import type { ZodError } from "zod";
import { getUserFromToken, type AuthUser } from "@/lib/auth";
import { SESSION_COOKIE, type Rol } from "@/lib/jwt";

export interface DetalleError {
  campo: string;
  mensaje: string;
}

/** Error de negocio con código HTTP. Lo lanzan los servicios y lo traduce `handleRoute`. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detalles?: DetalleError[],
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, detalles?: DetalleError[]) => new ApiError(400, msg, detalles);
export const unauthorized = (msg = "No autenticado") => new ApiError(401, msg);
export const forbidden = (msg = "No tenés permiso para acceder a este recurso") => new ApiError(403, msg);
export const notFound = (msg = "Recurso no encontrado") => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);

export function zodDetalles(error: ZodError): DetalleError[] {
  return error.issues.map((issue) => ({ campo: issue.path.join("."), mensaje: issue.message }));
}

export function validationError(error: ZodError): ApiError {
  return badRequest("Datos inválidos", zodDetalles(error));
}

/** Envuelve un handler y convierte cualquier error en una respuesta JSON con el código adecuado. */
export async function handleRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, ...(error.detalles ? { detalles: error.detalles } : {}) },
        { status: error.status },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "El recurso ya existe" }, { status: 409 });
    }
    // Base inalcanzable (p. ej. Neon despertando o caído): el detalle queda solo en los logs.
    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error("Error de conexión a la base de datos:", error.errorCode, error.message);
      return NextResponse.json({ error: "Servicio no disponible, intentá de nuevo en unos segundos" }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/** Lee el body JSON; si no es JSON válido responde 400. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("El cuerpo de la solicitud no es JSON válido");
  }
}

/**
 * Autenticación + autorización por rol para las APIs.
 * 401 si no hay token válido o el usuario ya no existe; 403 si el rol no corresponde.
 */
export async function requireApiUser(req: NextRequest, rol: Rol): Promise<AuthUser> {
  const user = await getUserFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw unauthorized();
  if (user.rol !== rol) throw forbidden("Tu rol no tiene acceso a esta funcionalidad");
  return user;
}
