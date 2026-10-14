import { SignJWT, jwtVerify } from "jose";

// Este módulo no usa APIs de Node: se puede importar desde el middleware (Edge runtime).

export type Rol = "PROFESOR" | "ALUMNO";

export interface SessionPayload {
  sub: string;
  rol: Rol;
  nombre: string;
}

export const SESSION_COOKIE = "session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 horas

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET no está configurado o tiene menos de 32 caracteres");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ rol: payload.rol, nombre: payload.nombre })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret());
}

/** Devuelve el payload si el token es válido (firma + expiración), o null. */
export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    if (
      typeof payload.sub !== "string" ||
      (payload.rol !== "PROFESOR" && payload.rol !== "ALUMNO") ||
      typeof payload.nombre !== "string"
    ) {
      return null;
    }
    return { sub: payload.sub, rol: payload.rol, nombre: payload.nombre };
  } catch {
    return null;
  }
}

export function homeForRol(rol: Rol): string {
  return rol === "PROFESOR" ? "/profesor" : "/alumno";
}
