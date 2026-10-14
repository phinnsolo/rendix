import { NextResponse, type NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { handleRoute, readJson, unauthorized, validationError } from "@/lib/http";
import { SESSION_COOKIE, SESSION_DURATION_SECONDS, homeForRol, signSession } from "@/lib/jwt";
import { loginSchema } from "@/lib/validations/auth";

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const parsed = loginSchema.safeParse(await readJson(req));
    if (!parsed.success) throw validationError(parsed.error);

    const user = await authenticate(parsed.data.email, parsed.data.password);
    // Mismo mensaje para usuario inexistente y contraseña incorrecta.
    if (!user) throw unauthorized("Email o contraseña incorrectos");

    const token = await signSession({ sub: user.id, rol: user.rol, nombre: user.nombre });
    const res = NextResponse.json({
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol },
      redirectTo: homeForRol(user.rol),
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, // inaccesible desde JavaScript (mitiga robo por XSS)
      sameSite: "lax", // mitiga CSRF
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });
    return res;
  });
}
