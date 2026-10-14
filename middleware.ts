import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, homeForRol, verifySession, type Rol } from "@/lib/jwt";

// Primera barrera de seguridad (Edge): verifica el JWT y el rol según el prefijo de la ruta.
// Las APIs y páginas vuelven a verificar todo en el servidor (usuario existente, rol y
// propiedad del recurso): el middleware no es la única defensa.

const RUTAS_POR_ROL: { prefijo: string; rol: Rol }[] = [
  { prefijo: "/api/profesor", rol: "PROFESOR" },
  { prefijo: "/api/alumno", rol: "ALUMNO" },
  { prefijo: "/profesor", rol: "PROFESOR" },
  { prefijo: "/alumno", rol: "ALUMNO" },
];

function coincide(pathname: string, prefijo: string) {
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    // El servidor detectó que la sesión ya no es válida (p. ej. el usuario fue borrado):
    // se elimina la cookie en lugar de redirigir, evitando un bucle /login ↔ /profesor.
    if (req.nextUrl.searchParams.has("expirada")) {
      const res = NextResponse.next();
      if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    // Usuario ya logueado: directo a su vista.
    return session ? NextResponse.redirect(new URL(homeForRol(session.rol), req.url)) : NextResponse.next();
  }

  const regla = RUTAS_POR_ROL.find((r) => coincide(pathname, r.prefijo));
  if (!regla) return NextResponse.next();

  const esApi = pathname.startsWith("/api/");

  if (!session) {
    if (esApi) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const loginUrl = new URL("/login", req.url);
    const res = NextResponse.redirect(loginUrl);
    if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE); // token vencido o inválido
    return res;
  }

  if (session.rol !== regla.rol) {
    if (esApi) {
      return NextResponse.json({ error: "Tu rol no tiene acceso a esta funcionalidad" }, { status: 403 });
    }
    return NextResponse.rewrite(new URL("/no-autorizado", req.url), { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/profesor/:path*", "/alumno/:path*", "/api/profesor/:path*", "/api/alumno/:path*"],
};
