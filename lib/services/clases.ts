import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth";
import { badRequest, conflict, forbidden, notFound, validationError } from "@/lib/http";
import { claseSchema, inscripcionSchema } from "@/lib/validations/clase";

// Clases (comisiones) del profesor. Igual que el resto de los servicios: el profesor sale
// siempre del JWT y cada operación verifica que la clase le pertenezca.
//
// Relaciones:  PROFESOR → CLASE → ALUMNOS (InscripcionClase)   y   EXAMEN → CLASE.
// Un alumno ve los exámenes publicados de SU clase actual: no se crean asignaciones por alumno,
// así que un alumno que se agrega a la clase después de publicar también ve el examen.

const alumnoSelect = { id: true, nombre: true, email: true } as const;

const esUnico = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Carga una clase verificando que sea del profesor (404 si no existe, 403 si es de otro). */
export async function cargarClasePropia(user: AuthUser, claseId: string) {
  const clase = await prisma.clase.findUnique({ where: { id: claseId } });
  if (!clase) throw notFound("Clase no encontrada");
  if (clase.profesorId !== user.id) throw forbidden("Esta clase pertenece a otro profesor");
  return clase;
}

export async function listarClasesProfesor(user: AuthUser) {
  const clases = await prisma.clase.findMany({
    where: { profesorId: user.id },
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      createdAt: true,
      _count: { select: { inscripciones: true } },
      examenes: { select: { estado: true } },
    },
  });
  return clases.map(({ _count, examenes, ...c }) => ({
    ...c,
    alumnos: _count.inscripciones,
    examenesActivos: examenes.filter((e) => e.estado === "PUBLICADO").length,
    borradores: examenes.filter((e) => e.estado === "BORRADOR").length,
  }));
}

export type ClaseResumen = Awaited<ReturnType<typeof listarClasesProfesor>>[number];

/** Detalle de una clase: alumnos inscriptos y exámenes asignados (con su avance de entregas). */
export async function obtenerClase(user: AuthUser, claseId: string) {
  await cargarClasePropia(user, claseId);
  const clase = await prisma.clase.findUniqueOrThrow({
    where: { id: claseId },
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      createdAt: true,
      inscripciones: {
        orderBy: { alumno: { nombre: "asc" } },
        select: { createdAt: true, alumno: { select: alumnoSelect } },
      },
      examenes: {
        orderBy: { fechaCreacion: "desc" },
        select: {
          id: true,
          titulo: true,
          estado: true,
          modo: true,
          fechaPublicacion: true,
          fechaDisponible: true,
          duracionMinutos: true,
          _count: { select: { temas: true, consignas: true } },
          entregas: { where: { estado: { not: "EN_CURSO" } }, select: { alumnoId: true, estado: true } },
        },
      },
    },
  });
  const inscriptos = new Set(clase.inscripciones.map((i) => i.alumno.id));
  return {
    id: clase.id,
    nombre: clase.nombre,
    descripcion: clase.descripcion,
    createdAt: clase.createdAt,
    alumnos: clase.inscripciones.map((i) => ({ ...i.alumno, desde: i.createdAt })),
    examenes: clase.examenes.map(({ entregas, _count, ...e }) => ({
      ...e,
      temas: _count.temas,
      preguntas: _count.consignas,
      // Solo cuentan las entregas de alumnos que hoy están en la clase.
      entregas: entregas.filter((x) => inscriptos.has(x.alumnoId)).length,
      corregidas: entregas.filter((x) => inscriptos.has(x.alumnoId) && x.estado === "CORREGIDO").length,
    })),
  };
}

export type ClaseDetalle = Awaited<ReturnType<typeof obtenerClase>>;

export async function crearClase(user: AuthUser, body: unknown) {
  const parsed = claseSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  try {
    return await prisma.clase.create({ data: { ...parsed.data, profesorId: user.id } });
  } catch (error) {
    if (esUnico(error)) throw conflict("Ya tenés una clase con ese nombre");
    throw error;
  }
}

export async function actualizarClase(user: AuthUser, claseId: string, body: unknown) {
  await cargarClasePropia(user, claseId);
  const parsed = claseSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  try {
    return await prisma.clase.update({ where: { id: claseId }, data: parsed.data });
  } catch (error) {
    if (esUnico(error)) throw conflict("Ya tenés una clase con ese nombre");
    throw error;
  }
}

/**
 * Agrega un alumno a la clase. Si estaba en OTRA clase del mismo profesor, lo cambia de clase
 * (sus entregas anteriores se conservan). Si pertenece a la clase de otro profesor, se rechaza.
 */
export async function inscribirAlumno(user: AuthUser, claseId: string, body: unknown) {
  const clase = await cargarClasePropia(user, claseId);
  const parsed = inscripcionSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const { alumnoId } = parsed.data;

  const alumno = await prisma.usuario.findUnique({
    where: { id: alumnoId },
    select: { ...alumnoSelect, rol: true, inscripcion: { select: { clase: { select: { id: true, nombre: true, profesorId: true } } } } },
  });
  if (!alumno || alumno.rol !== "ALUMNO") {
    throw badRequest("El alumno no existe", [{ campo: "alumnoId", mensaje: "El alumno no existe" }]);
  }
  const actual = alumno.inscripcion?.clase ?? null;
  if (actual?.id === claseId) throw conflict(`${alumno.nombre} ya pertenece a esta clase`);
  if (actual && actual.profesorId !== user.id) {
    throw conflict(`${alumno.nombre} pertenece a una clase de otro profesor`);
  }

  try {
    if (actual) {
      // Cambio de clase: solo se modifica la asociación (condicionado a la clase de origen por si cambió en el medio).
      const { count } = await prisma.inscripcionClase.updateMany({
        where: { alumnoId, claseId: actual.id },
        data: { claseId, createdAt: new Date() },
      });
      if (count === 0) throw conflict("La clase del alumno cambió mientras tanto. Recargá e intentá de nuevo.");
    } else {
      await prisma.inscripcionClase.create({ data: { alumnoId, claseId } });
    }
  } catch (error) {
    if (esUnico(error)) throw conflict(`${alumno.nombre} ya fue agregado a otra clase`);
    throw error;
  }
  return {
    alumno: { id: alumno.id, nombre: alumno.nombre, email: alumno.email },
    clase: { id: clase.id, nombre: clase.nombre },
    movidoDesde: actual ? { id: actual.id, nombre: actual.nombre } : null,
  };
}

/** Quita al alumno de la clase. NO elimina al alumno ni sus entregas: solo la asociación. */
export async function quitarAlumno(user: AuthUser, claseId: string, alumnoId: string) {
  await cargarClasePropia(user, claseId);
  const { count } = await prisma.inscripcionClase.deleteMany({ where: { claseId, alumnoId } });
  if (count === 0) throw notFound("El alumno no pertenece a esta clase");
  return { ok: true };
}

/**
 * Alumnos que el profesor puede gestionar o incorporar: los de sus clases y los que no tienen clase.
 * De los alumnos de otros profesores solo se informa que están en otra clase (sin datos de esa clase).
 */
export async function listarAlumnosGestion(user: AuthUser) {
  const alumnos = await prisma.usuario.findMany({
    where: { rol: "ALUMNO" },
    orderBy: { nombre: "asc" },
    select: { ...alumnoSelect, inscripcion: { select: { clase: { select: { id: true, nombre: true, profesorId: true } } } } },
  });
  return alumnos.map(({ inscripcion, ...a }) => {
    const clase = inscripcion?.clase ?? null;
    const propia = clase !== null && clase.profesorId === user.id;
    return {
      ...a,
      clase: propia ? { id: clase.id, nombre: clase.nombre } : null,
      // true = está en la clase de otro profesor (no se puede incorporar).
      otraCatedra: clase !== null && !propia,
    };
  });
}

export type AlumnoGestion = Awaited<ReturnType<typeof listarAlumnosGestion>>[number];
