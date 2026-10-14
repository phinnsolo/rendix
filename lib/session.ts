import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserFromToken, type AuthUser } from "@/lib/auth";
import { SESSION_COOKIE, type Rol } from "@/lib/jwt";

// Helpers de sesión para Server Components (páginas y layouts).

export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  const store = await cookies();
  return getUserFromToken(store.get(SESSION_COOKIE)?.value);
});

/** Exige sesión con un rol dado; si no, redirige (login o página de acceso denegado). */
export async function requireRole(rol: Rol): Promise<AuthUser> {
  const user = await getSessionUser();
  // Token ausente/inválido o de un usuario que ya no existe: el middleware borra la cookie en /login?expirada=1.
  if (!user) redirect("/login?expirada=1");
  if (user.rol !== rol) redirect("/no-autorizado");
  return user;
}
