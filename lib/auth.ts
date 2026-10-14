import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifySession, type Rol } from "@/lib/jwt";

const BCRYPT_ROUNDS = 10;

// Hash válido de una contraseña cualquiera: se compara contra él cuando el usuario
// no existe, para que la respuesta tarde lo mismo y no revele qué emails existen.
const DUMMY_HASH = "$2b$10$jiMwNcvkCV/kYLC0.J1EeOFqhWiJexGxjkawJYc257WzUrsOKM412";

export interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Verifica credenciales contra la base. Devuelve el usuario o null (nunca dice por qué falló). */
export async function authenticate(email: string, password: string): Promise<AuthUser | null> {
  const usuario = await prisma.usuario.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await bcrypt.compare(password, usuario?.passwordHash ?? DUMMY_HASH);
  if (!usuario || !ok) return null;
  return { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol };
}

/**
 * Resuelve el usuario a partir del JWT: valida firma/expiración y además comprueba
 * que el usuario siga existiendo en la base. El rol se toma de la base, no del token.
 */
export async function getUserFromToken(token: string | undefined | null): Promise<AuthUser | null> {
  const payload = await verifySession(token);
  if (!payload) return null;
  const usuario = await prisma.usuario.findUnique({
    where: { id: payload.sub },
    select: { id: true, nombre: true, email: true, rol: true },
  });
  return usuario;
}
