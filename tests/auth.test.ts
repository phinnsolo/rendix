import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as listarExamenesProfesor } from "@/app/api/profesor/examenes/route";
import { GET as listarExamenesAlumno } from "@/app/api/alumno/examenes/route";
import { SESSION_COOKIE, verifySession } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { middleware } from "@/middleware";
import { crearUsuarios, PASS_ALUMNO, PASS_PROFESOR, req, resetDb, tokenDe, type Fixture } from "./helpers";

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await crearUsuarios();
});

describe("US1 - Login", () => {
  it("login correcto profesor: 200, cookie JWT httpOnly y redirección a /profesor", async () => {
    const inicio = Date.now();
    const res = await login(await req("POST", "/api/auth/login", { body: { email: "profesor@test.com", password: PASS_PROFESOR } }));
    const duracion = Date.now() - inicio;

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.redirectTo).toBe("/profesor");
    expect(data.user).toMatchObject({ email: "profesor@test.com", rol: "PROFESOR" });
    expect(data.user.passwordHash).toBeUndefined();

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");

    const token = setCookie.split(";")[0].split("=")[1];
    expect(await verifySession(token)).toMatchObject({ sub: f.profesor.id, rol: "PROFESOR" });
    expect(duracion).toBeLessThan(2000); // objetivo: login <= 2 segundos
  });

  it("login correcto alumno: redirección a /alumno", async () => {
    const res = await login(await req("POST", "/api/auth/login", { body: { email: "alumno1@test.com", password: PASS_ALUMNO } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.redirectTo).toBe("/alumno");
    expect(data.user.rol).toBe("ALUMNO");
  });

  it("el email no distingue mayúsculas", async () => {
    const res = await login(await req("POST", "/api/auth/login", { body: { email: "  ALUMNO1@test.com ", password: PASS_ALUMNO } }));
    expect(res.status).toBe(200);
  });

  it("contraseña incorrecta rechazada con 401 y sin cookie", async () => {
    const res = await login(await req("POST", "/api/auth/login", { body: { email: "profesor@test.com", password: "incorrecta" } }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Email o contraseña incorrectos");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("usuario inexistente no puede ingresar (mismo mensaje que contraseña incorrecta)", async () => {
    const res = await login(await req("POST", "/api/auth/login", { body: { email: "nadie@test.com", password: PASS_ALUMNO } }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Email o contraseña incorrectos");
  });

  it("datos inválidos → 400", async () => {
    const res1 = await login(await req("POST", "/api/auth/login", { body: { email: "no-es-email", password: "x" } }));
    expect(res1.status).toBe(400);
    const res2 = await login(await req("POST", "/api/auth/login", { rawBody: "{no json" }));
    expect(res2.status).toBe(400);
  });

  it("las contraseñas se guardan hasheadas con bcrypt", async () => {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { email: "alumno1@test.com" } });
    expect(u.passwordHash).not.toBe(PASS_ALUMNO);
    expect(u.passwordHash).toMatch(/^\$2[aby]\$10\$/);
  });

  it("logout borra la cookie de sesión", async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
  });

  it("no existe endpoint ni página pública de registro", () => {
    const appDir = path.resolve(import.meta.dirname, "../app");
    const rutas: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(p);
        else rutas.push(path.relative(appDir, p));
      }
    };
    recorrer(appDir);
    expect(rutas.filter((r) => /regist|signup/i.test(r))).toEqual([]);
  });
});

describe("US1 - Autorización por rol (backend)", () => {
  it("alumno no puede acceder a la API de profesor (403 en el handler)", async () => {
    const res = await listarExamenesProfesor(await req("GET", "/api/profesor/examenes", { user: f.alumno1 }));
    expect(res.status).toBe(403);
  });

  it("profesor no puede acceder a la API de alumno (403)", async () => {
    const res = await listarExamenesAlumno(await req("GET", "/api/alumno/examenes", { user: f.profesor }));
    expect(res.status).toBe(403);
  });

  it("sin sesión → 401", async () => {
    const res = await listarExamenesProfesor(await req("GET", "/api/profesor/examenes"));
    expect(res.status).toBe(401);
  });

  it("token adulterado → 401", async () => {
    const token = (await tokenDe(f.profesor)).slice(0, -3) + "abc";
    const res = await listarExamenesProfesor(await req("GET", "/api/profesor/examenes", { token }));
    expect(res.status).toBe(401);
  });

  it("token de un usuario que ya no existe → 401", async () => {
    const token = await tokenDe(f.alumno3);
    await prisma.usuario.delete({ where: { id: f.alumno3.id } });
    const res = await listarExamenesAlumno(await req("GET", "/api/alumno/examenes", { token }));
    expect(res.status).toBe(401);
  });

  it("el rol se toma de la base, no del token: un token con rol PROFESOR falsificado no sirve sin la firma", async () => {
    // Firmado con nuestro secreto pero para un alumno: aunque diga PROFESOR, el rol real es ALUMNO.
    const token = await tokenDe({ ...f.alumno1, rol: "PROFESOR" });
    const res = await listarExamenesProfesor(await req("GET", "/api/profesor/examenes", { token }));
    expect(res.status).toBe(403);
  });
});

describe("US1 - Middleware (protección de rutas)", () => {
  it("alumno que entra a /profesor recibe 403", async () => {
    const res = await middleware(await req("GET", "/profesor", { user: f.alumno1 }));
    expect(res.status).toBe(403);
    expect(res.headers.get("x-middleware-rewrite")).toContain("/no-autorizado");
  });

  it("alumno que llama a /api/profesor/examenes recibe 403 JSON", async () => {
    const res = await middleware(await req("GET", "/api/profesor/examenes", { user: f.alumno1 }));
    expect(res.status).toBe(403);
  });

  it("sin sesión: páginas redirigen a /login y APIs devuelven 401", async () => {
    const page = await middleware(await req("GET", "/alumno"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/login");
    const api = await middleware(await req("GET", "/api/alumno/examenes"));
    expect(api.status).toBe(401);
  });

  it("profesor puede entrar a /profesor", async () => {
    const res = await middleware(await req("GET", "/profesor/examenes/nuevo", { user: f.profesor }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("sesión de un usuario que ya no existe: /login?expirada=1 borra la cookie sin redirigir (sin bucle)", async () => {
    const res = await middleware(await req("GET", "/login?expirada=1", { user: f.alumno2 }));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
  });

  it("usuario logueado que abre /login es enviado a su vista", async () => {
    const res = await middleware(await req("GET", "/login", { user: f.alumno2 }));
    expect(res.headers.get("location")).toContain("/alumno");
  });
});
