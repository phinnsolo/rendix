import { NextRequest } from "next/server";
import type { Usuario } from "@prisma/client";
import { hashPassword } from "@/lib/auth";
import { SESSION_COOKIE, signSession } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

export const PASS_PROFESOR = "Profesor123!";
export const PASS_ALUMNO = "Alumno123!";

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Respuesta", "Entrega", "AsignacionExamen", "Consigna", "Tema", "Examen", "InscripcionClase", "Clase", "Usuario" CASCADE',
  );
}

export interface Fixture {
  profesor: Usuario;
  profesor2: Usuario;
  alumno1: Usuario;
  alumno2: Usuario;
  alumno3: Usuario;
}

/** Usuarios base: 2 profesores (para probar acceso horizontal) y 3 alumnos. */
export async function crearUsuarios(): Promise<Fixture> {
  const [hProf, hAlu] = await Promise.all([hashPassword(PASS_PROFESOR), hashPassword(PASS_ALUMNO)]);
  const crear = (nombre: string, email: string, rol: "PROFESOR" | "ALUMNO") =>
    prisma.usuario.create({ data: { nombre, email, rol, passwordHash: rol === "PROFESOR" ? hProf : hAlu } });
  const [profesor, profesor2, alumno1, alumno2, alumno3] = await Promise.all([
    crear("Laura Fernández", "profesor@test.com", "PROFESOR"),
    crear("Carlos Ruiz", "profesor2@test.com", "PROFESOR"),
    crear("Juan Pérez", "alumno1@test.com", "ALUMNO"),
    crear("María López", "alumno2@test.com", "ALUMNO"),
    crear("Pedro García", "alumno3@test.com", "ALUMNO"),
  ]);
  return { profesor, profesor2, alumno1, alumno2, alumno3 };
}

export async function tokenDe(user: Pick<Usuario, "id" | "rol" | "nombre">) {
  return signSession({ sub: user.id, rol: user.rol, nombre: user.nombre });
}

interface ReqOpts {
  body?: unknown;
  rawBody?: string;
  user?: Pick<Usuario, "id" | "rol" | "nombre">;
  token?: string;
}

/** Construye un NextRequest como lo recibiría el Route Handler (cookie de sesión incluida). */
export async function req(method: string, path: string, opts: ReqOpts = {}) {
  const headers = new Headers();
  const token = opts.token ?? (opts.user ? await tokenDe(opts.user) : undefined);
  if (token) headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  let body: string | undefined;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody;
    headers.set("content-type", "application/json");
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers.set("content-type", "application/json");
  }
  return new NextRequest(new URL(path, "http://localhost:3000"), { method, headers, body });
}

export const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

export const examenValido = (claseId: string | null = null) => ({
  titulo: "Parcial de prueba",
  enunciado: "Resolvé las siguientes consignas.",
  habilitarEscritura: true,
  habilitarCalculadora: true,
  habilitarGeoGebra: true,
  consignas: [
    { texto: "¿Cuánto es 2 + 2?", puntaje: 4 },
    { texto: "Graficá y = x²", puntaje: 6 },
  ],
  claseId,
});

/** Examen POR_TEMAS válido (3 temas con 2, 1 y 2 consignas). */
export const examenPorTemasValido = (claseId: string | null = null) => ({
  titulo: "TP Final",
  enunciado: "Elegí un tema.",
  modo: "POR_TEMAS",
  habilitarEscritura: true,
  habilitarCalculadora: false,
  habilitarGeoGebra: false,
  claseId,
  temas: [
    {
      nombre: "Tema 1",
      titulo: "Inteligencia Artificial",
      descripcion: "IA en organizaciones",
      consignas: [
        { texto: "T1 - Pregunta 1", puntaje: 5 },
        { texto: "T1 - Pregunta 2", puntaje: 5, tipo: "VERDADERO_FALSO", respuestaCorrecta: 0 },
      ],
    },
    { nombre: "Tema 2", titulo: "Blockchain", consignas: [{ texto: "T2 - Pregunta 1", puntaje: 10 }] },
    {
      nombre: "Tema 3",
      titulo: "Cloud Computing",
      consignas: [
        { texto: "T3 - Pregunta 1", puntaje: 4 },
        { texto: "T3 - Pregunta 2", puntaje: 6 },
      ],
    },
  ],
});

/**
 * Crea una clase del profesor con esos alumnos. Como un alumno pertenece a una sola clase,
 * si ya estaba en otra se lo cambia de clase.
 */
export async function crearClaseDb(profesorId: string, alumnoIds: string[] = [], nombre?: string) {
  const clase = await prisma.clase.create({
    data: { profesorId, nombre: nombre ?? `Clase ${Math.random().toString(36).slice(2, 8)}` },
  });
  await inscribirDb(clase.id, alumnoIds);
  return clase;
}

/** Inscribe (o cambia de clase) a los alumnos directamente en la base. */
export async function inscribirDb(claseId: string, alumnoIds: string[]) {
  for (const alumnoId of alumnoIds) {
    await prisma.inscripcionClase.upsert({ where: { alumnoId }, update: { claseId }, create: { alumnoId, claseId } });
  }
}

/** Clase "de trabajo" del profesor en los tests: se reutiliza entre exámenes del mismo test. */
async function claseDeTrabajo(profesorId: string) {
  const existente = await prisma.clase.findFirst({ where: { profesorId, nombre: "Clase de prueba" } });
  return existente ?? prisma.clase.create({ data: { profesorId, nombre: "Clase de prueba" } });
}

/** Crea un examen directamente en la base (para preparar escenarios). */
export async function crearExamenDb(
  profesorId: string,
  opts: {
    estado?: "BORRADOR" | "PUBLICADO";
    /** Atajo: inscribe a estos alumnos en la clase de trabajo del profesor y le asigna el examen. */
    alumnoIds?: string[];
    claseId?: string | null;
    fechaDisponible?: Date | null;
    duracionMinutos?: number | null;
    titulo?: string;
    escritura?: boolean;
    calculadora?: boolean;
    geogebra?: boolean;
  } = {},
) {
  const estado = opts.estado ?? "PUBLICADO";
  let claseId = opts.claseId ?? null;
  if (opts.alumnoIds && claseId === null) {
    const clase = await claseDeTrabajo(profesorId);
    await inscribirDb(clase.id, opts.alumnoIds);
    claseId = clase.id;
  }
  return prisma.examen.create({
    data: {
      titulo: opts.titulo ?? `Examen ${estado}`,
      enunciado: "Enunciado de prueba",
      estado,
      fechaPublicacion: estado === "PUBLICADO" ? new Date() : null,
      profesorId,
      claseId,
      fechaDisponible: opts.fechaDisponible ?? null,
      duracionMinutos: opts.duracionMinutos ?? null,
      habilitarEscritura: opts.escritura ?? true,
      habilitarCalculadora: opts.calculadora ?? true,
      habilitarGeoGebra: opts.geogebra ?? true,
      consignas: {
        create: [
          { orden: 1, texto: "Consigna uno", puntaje: 5 },
          { orden: 2, texto: "Consigna dos", puntaje: 5 },
        ],
      },
    },
    include: { consignas: { orderBy: { orden: "asc" } } },
  });
}
