import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth";
import { calcularNotaTotal } from "@/lib/correccion";
import { parsearDiagrama } from "@/lib/diagrama";
import { badRequest, conflict, forbidden, notFound, validationError, type DetalleError } from "@/lib/http";
import { cargarClasePropia } from "@/lib/services/clases";
import { cerrarEntregasVencidas, consignasDelTema, puntajeMaximoEntrega } from "@/lib/services/entregas";
import { correccionSchema } from "@/lib/validations/correccion";
import { asignacionClaseSchema, examenSchema, publicacionSchema, type ExamenData } from "@/lib/validations/examen";

// Toda función recibe el profesor autenticado (nunca un profesorId enviado por el cliente)
// y verifica la propiedad del examen (y de la clase) antes de leer o modificar.

const includeDetalle = {
  clase: { select: { id: true, nombre: true, _count: { select: { inscripciones: true } } } },
  temas: { orderBy: { orden: "asc" as const } },
  consignas: { orderBy: { orden: "asc" as const } },
};

const alumnoSelect = { id: true, nombre: true, email: true } as const;

export async function listarExamenesProfesor(user: AuthUser) {
  return prisma.examen.findMany({
    where: { profesorId: user.id },
    orderBy: { fechaCreacion: "desc" },
    select: {
      id: true,
      titulo: true,
      estado: true,
      modo: true,
      fechaCreacion: true,
      fechaPublicacion: true,
      fechaDisponible: true,
      duracionMinutos: true,
      clase: { select: { id: true, nombre: true } },
      _count: {
        select: { consignas: true, temas: true, entregas: { where: { estado: { not: "EN_CURSO" } } } },
      },
    },
  });
}

/** La clase elegida debe existir y ser del profesor (nunca se confía en el id enviado). */
async function verificarClase(user: AuthUser, claseId: string | null) {
  if (claseId === null) return;
  try {
    await cargarClasePropia(user, claseId);
  } catch {
    throw badRequest("La clase elegida no existe o no es tuya", [
      { campo: "claseId", mensaje: "La clase elegida no existe o no es tuya" },
    ]);
  }
}

/** Carga un examen verificando que pertenezca al profesor (404 si no existe, 403 si es de otro). */
async function cargarExamenPropio(user: AuthUser, examenId: string) {
  const examen = await prisma.examen.findUnique({ where: { id: examenId }, include: includeDetalle });
  if (!examen) throw notFound("Examen no encontrado");
  if (examen.profesorId !== user.id) throw forbidden("Este examen pertenece a otro profesor");
  return examen;
}

export const obtenerExamenProfesor = cargarExamenPropio;

type ConsignaData = ExamenData["consignas"][number];

function datosConsigna(c: ConsignaData, i: number) {
  return {
    texto: c.texto,
    puntaje: c.puntaje,
    orden: i + 1,
    tipo: c.tipo,
    opciones: c.opciones,
    respuestaCorrecta: c.respuestaCorrecta,
    criterio: c.criterio,
  };
}

function datosGenerales(data: ExamenData) {
  return {
    titulo: data.titulo,
    enunciado: data.enunciado,
    modo: data.modo,
    habilitarEscritura: data.habilitarEscritura,
    habilitarCalculadora: data.habilitarCalculadora,
    habilitarGeoGebra: data.habilitarGeoGebra,
    claseId: data.claseId,
    fechaDisponible: data.fechaDisponible ? new Date(data.fechaDisponible) : null,
    duracionMinutos: data.duracionMinutos,
  };
}

/**
 * Crea temas y consignas del examen. El `orden` de las consignas es correlativo en todo el examen
 * (UNIQUE examenId + orden); dentro de cada tema se numeran por posición al mostrarlas.
 */
async function crearContenido(tx: Prisma.TransactionClient, examenId: string, data: ExamenData) {
  if (data.modo === "NORMAL") {
    await tx.consigna.createMany({ data: data.consignas.map((c, i) => ({ examenId, ...datosConsigna(c, i) })) });
    return;
  }
  let orden = 0;
  for (const [i, t] of data.temas.entries()) {
    const tema = await tx.tema.create({
      data: { examenId, nombre: t.nombre, titulo: t.titulo, descripcion: t.descripcion, orden: i + 1 },
    });
    await tx.consigna.createMany({
      data: t.consignas.map((c) => ({ examenId, temaId: tema.id, ...datosConsigna(c, orden++) })),
    });
  }
}

function parsearExamen(body: unknown): ExamenData {
  const parsed = examenSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export async function crearExamen(user: AuthUser, body: unknown) {
  const data = parsearExamen(body);
  await verificarClase(user, data.claseId);

  // Examen + temas + consignas en una única transacción.
  return prisma.$transaction(async (tx) => {
    const examen = await tx.examen.create({
      data: { ...datosGenerales(data), estado: "BORRADOR", profesorId: user.id },
    });
    await crearContenido(tx, examen.id, data);
    return tx.examen.findUniqueOrThrow({ where: { id: examen.id }, include: includeDetalle });
  });
}

export async function actualizarExamen(user: AuthUser, examenId: string, body: unknown) {
  const examen = await cargarExamenPropio(user, examenId);
  if (examen.estado !== "BORRADOR") {
    throw conflict("Un examen publicado no puede editarse");
  }
  const data = parsearExamen(body);
  await verificarClase(user, data.claseId);

  return prisma.$transaction(async (tx) => {
    // Condición sobre el estado: si otro request lo publicó en el medio, no se pisa.
    const { count } = await tx.examen.updateMany({
      where: { id: examenId, estado: "BORRADOR" },
      data: datosGenerales(data),
    });
    if (count === 0) throw conflict("Un examen publicado no puede editarse");

    // Un borrador no tiene entregas: temas y consignas se reemplazan completos. Así el mismo
    // guardado crea, edita, elimina y reordena los temas junto con sus preguntas.
    await tx.consigna.deleteMany({ where: { examenId } });
    await tx.tema.deleteMany({ where: { examenId } });
    await crearContenido(tx, examenId, data);
    return tx.examen.findUniqueOrThrow({ where: { id: examenId }, include: includeDetalle });
  });
}

type ConsignaDb = ExamenProfesorDetalle["consignas"][number];

const datosValidacion = (c: ConsignaDb) => ({
  texto: c.texto,
  puntaje: c.puntaje,
  tipo: c.tipo,
  opciones: c.opciones,
  respuestaCorrecta: c.respuestaCorrecta,
  criterio: c.criterio,
});

export async function publicarExamen(user: AuthUser, examenId: string) {
  const examen = await cargarExamenPropio(user, examenId);
  if (examen.estado === "PUBLICADO") throw conflict("El examen ya está publicado");

  // Se revalida lo guardado: título, enunciado, estructura según el modo (consignas, o al
  // menos dos temas con consignas) y la clase a la que se asigna.
  const parsed = publicacionSchema.safeParse({
    titulo: examen.titulo,
    enunciado: examen.enunciado,
    modo: examen.modo,
    consignas: examen.modo === "NORMAL" ? examen.consignas.map(datosValidacion) : [],
    temas: examen.temas.map((t) => ({
      nombre: t.nombre,
      titulo: t.titulo,
      descripcion: t.descripcion,
      consignas: examen.consignas.filter((c) => c.temaId === t.id).map(datosValidacion),
    })),
  });
  const detalles: DetalleError[] = parsed.success ? [] : (validationError(parsed.error).detalles ?? []);
  if (!examen.claseId) detalles.push({ campo: "claseId", mensaje: "Asigná el examen a una clase antes de publicarlo" });
  if (detalles.length > 0) {
    throw badRequest("El examen no cumple los requisitos para publicarse", detalles);
  }

  const { count } = await prisma.examen.updateMany({
    where: { id: examenId, profesorId: user.id, estado: "BORRADOR" },
    data: { estado: "PUBLICADO", fechaPublicacion: new Date() },
  });
  if (count === 0) throw conflict("El examen ya está publicado");
  return prisma.examen.findUniqueOrThrow({ where: { id: examenId }, include: includeDetalle });
}

/**
 * Asigna (o cambia) la clase de un examen. Una vez que algún alumno eligió tema, comenzó o
 * entregó, la clase ya no se puede cambiar: esas entregas pertenecen a la clase original.
 */
export async function asignarClaseExamen(user: AuthUser, examenId: string, body: unknown) {
  const examen = await cargarExamenPropio(user, examenId);
  const parsed = asignacionClaseSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const { claseId } = parsed.data;
  await verificarClase(user, claseId);
  if (examen.claseId === claseId) return examen;

  const conActividad = await prisma.entrega.count({ where: { examenId } });
  if (conActividad > 0) {
    throw conflict("No se puede cambiar la clase: hay alumnos que ya comenzaron o entregaron este examen");
  }
  const { count } = await prisma.examen.updateMany({
    where: { id: examenId, profesorId: user.id, entregas: { none: {} } },
    data: { claseId },
  });
  if (count === 0) throw conflict("No se puede cambiar la clase: hay alumnos que ya comenzaron o entregaron este examen");
  return cargarExamenPropio(user, examenId);
}

/**
 * Estado de cada alumno frente al examen: todos los que HOY están en la clase del examen
 * (entregaron o no) más los que entregaron y después cambiaron de clase (historial).
 */
export async function listarEntregasExamen(user: AuthUser, examenId: string) {
  const examen = await cargarExamenPropio(user, examenId);
  await cerrarEntregasVencidas({ examenId });
  const [inscriptos, entregas] = await Promise.all([
    examen.claseId
      ? prisma.inscripcionClase.findMany({ where: { claseId: examen.claseId }, select: { alumno: { select: alumnoSelect } } })
      : Promise.resolve([]),
    prisma.entrega.findMany({
      where: { examenId },
      select: {
        id: true,
        alumnoId: true,
        fechaInicio: true,
        fechaEntrega: true,
        estado: true,
        notaTotal: true,
        temaId: true,
        alumno: { select: alumnoSelect },
      },
    }),
  ]);
  const temas = new Map(examen.temas.map((t) => [t.id, t]));
  const porAlumno = new Map(entregas.map((e) => [e.alumnoId, e]));
  const filas = new Map(inscriptos.map((i) => [i.alumno.id, { alumno: i.alumno, enClase: true }]));
  for (const e of entregas) {
    if (!filas.has(e.alumnoId) && e.estado !== "EN_CURSO") filas.set(e.alumnoId, { alumno: e.alumno, enClase: false });
  }
  return [...filas.values()]
    .sort((a, b) => a.alumno.nombre.localeCompare(b.alumno.nombre, "es"))
    .map(({ alumno, enClase }) => {
      const entrega = porAlumno.get(alumno.id);
      const entregado = entrega !== undefined && entrega.estado !== "EN_CURSO";
      const tema = entrega?.temaId ? temas.get(entrega.temaId) : undefined;
      return {
        alumno,
        /** false = entregó, pero hoy ya no pertenece a la clase del examen. */
        enClase,
        entregado,
        // Solo las entregas enviadas se pueden abrir y corregir.
        entregaId: entregado ? entrega.id : null,
        fechaInicio: entrega?.fechaInicio ?? null,
        fechaEntrega: entregado ? entrega.fechaEntrega : null,
        // EN_CURSO = eligió tema o comenzó; ENTREGADO = pendiente de corrección; EN_CORRECCION; CORREGIDO
        estado: entrega?.estado ?? null,
        notaTotal: entrega?.notaTotal ?? null,
        tema: tema ? { id: tema.id, nombre: tema.nombre, titulo: tema.titulo } : null,
        puntajeMaximo: puntajeMaximoEntrega(examen, entrega?.temaId),
      };
    });
}

export async function obtenerEntregaProfesor(user: AuthUser, entregaId: string) {
  const entrega = await prisma.entrega.findUnique({
    where: { id: entregaId },
    include: {
      alumno: { select: alumnoSelect },
      examen: { include: { consignas: { orderBy: { orden: "asc" } } } },
      tema: { select: { id: true, nombre: true, titulo: true, descripcion: true } },
      respuestas: true,
    },
  });
  if (!entrega) throw notFound("Entrega no encontrada");
  if (entrega.examen.profesorId !== user.id) throw forbidden("Esta entrega pertenece a un examen de otro profesor");
  // Una entrega EN_CURSO todavía no existe para el profesor: no se puede ver ni corregir.
  if (entrega.estado === "EN_CURSO") throw notFound("El alumno todavía no entregó este examen");

  // En un examen por temas solo se muestran (y se corrigen) las consignas del tema elegido.
  const consignas = consignasDelTema(entrega.examen, entrega.temaId);
  const respuestaPorConsigna = new Map(entrega.respuestas.map((r) => [r.consignaId, r]));
  return {
    id: entrega.id,
    estado: entrega.estado,
    fechaInicio: entrega.fechaInicio,
    fechaEntrega: entrega.fechaEntrega,
    geogebraState: entrega.geogebraState,
    notaTotal: entrega.notaTotal,
    puntajeMaximo: consignas.reduce((acc, c) => acc + c.puntaje, 0),
    feedbackGeneral: entrega.feedbackGeneral,
    fechaCorreccion: entrega.fechaCorreccion,
    alumno: entrega.alumno,
    tema: entrega.tema,
    examen: {
      id: entrega.examen.id,
      titulo: entrega.examen.titulo,
      enunciado: entrega.examen.enunciado,
      modo: entrega.examen.modo,
      habilitarEscritura: entrega.examen.habilitarEscritura,
      habilitarCalculadora: entrega.examen.habilitarCalculadora,
      habilitarGeoGebra: entrega.examen.habilitarGeoGebra,
    },
    consignas: consignas.map((c, i) => {
      const r = respuestaPorConsigna.get(c.id);
      return {
        id: c.id,
        // Dentro de un tema las preguntas se numeran desde 1.
        orden: entrega.examen.modo === "POR_TEMAS" ? i + 1 : c.orden,
        texto: c.texto,
        puntaje: c.puntaje,
        tipo: c.tipo,
        opciones: c.opciones,
        respuestaCorrecta: c.respuestaCorrecta,
        criterio: c.criterio,
        // Respuesta del alumno
        respuesta: r?.texto ?? "",
        opcionSeleccionada: r?.opcionSeleccionada ?? null,
        diagrama: parsearDiagrama(r?.diagrama),
        // Corrección
        correccion: {
          puntajeSugerido: r?.puntajeSugerido ?? null,
          fuenteSugerencia: r?.fuenteSugerencia ?? null,
          sugerenciaDetalle: r?.sugerenciaDetalle ?? null,
          puntajeObtenido: r?.puntajeObtenido ?? null,
          feedback: r?.feedback ?? null,
        },
      };
    }),
  };
}

/**
 * Guarda la corrección del profesor. La nota total se recalcula en el servidor sumando
 * los puntajes asignados. Con `finalizar` la entrega pasa a CORREGIDO (exige todos los puntajes);
 * sin `finalizar` queda EN_CORRECCION. Se puede volver a editar en cualquier momento.
 */
export async function guardarCorreccion(user: AuthUser, entregaId: string, body: unknown) {
  const entrega = await prisma.entrega.findUnique({
    where: { id: entregaId },
    include: { examen: { include: { consignas: true } }, respuestas: true },
  });
  if (!entrega) throw notFound("Entrega no encontrada");
  if (entrega.examen.profesorId !== user.id) throw forbidden("Esta entrega pertenece a un examen de otro profesor");
  if (entrega.estado === "EN_CURSO") throw conflict("El alumno todavía no entregó este examen");

  const parsed = correccionSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const { correcciones, feedbackGeneral, finalizar } = parsed.data;

  // Solo se corrigen las consignas que le tocaron al alumno (las de su tema en exámenes por temas).
  const consignasEntrega = consignasDelTema(entrega.examen, entrega.temaId);
  const consignas = new Map(consignasEntrega.map((c) => [c.id, c]));
  const errores: DetalleError[] = [];
  correcciones.forEach((c, i) => {
    const consigna = consignas.get(c.consignaId);
    if (!consigna) {
      errores.push({ campo: `correcciones.${i}.consignaId`, mensaje: "La consigna no pertenece a esta entrega" });
    } else if (c.puntajeObtenido !== null && c.puntajeObtenido > consigna.puntaje) {
      errores.push({
        campo: `correcciones.${i}.puntajeObtenido`,
        mensaje: `El puntaje no puede superar el máximo de la consigna (${consigna.puntaje})`,
      });
    }
  });
  if (errores.length > 0) throw badRequest("La corrección tiene datos inválidos", errores);

  // Estado resultante: lo enviado pisa lo guardado; lo no enviado se conserva.
  const porConsigna = new Map(correcciones.map((c) => [c.consignaId, c]));
  const puntajesFinales = consignasEntrega.map((c) => {
    const enviada = porConsigna.get(c.id);
    const guardada = entrega.respuestas.find((r) => r.consignaId === c.id);
    return enviada ? enviada.puntajeObtenido : (guardada?.puntajeObtenido ?? null);
  });
  if (finalizar && puntajesFinales.some((p) => p === null)) {
    throw badRequest("Para marcar como corregido, asigná un puntaje a todas las consignas");
  }

  await prisma.$transaction(async (tx) => {
    for (const c of correcciones) {
      await tx.respuesta.upsert({
        where: { entregaId_consignaId: { entregaId, consignaId: c.consignaId } },
        update: { puntajeObtenido: c.puntajeObtenido, feedback: c.feedback },
        create: { entregaId, consignaId: c.consignaId, texto: "", puntajeObtenido: c.puntajeObtenido, feedback: c.feedback },
      });
    }
    await tx.entrega.update({
      where: { id: entregaId },
      data: {
        notaTotal: calcularNotaTotal(puntajesFinales),
        feedbackGeneral,
        estado: finalizar ? "CORREGIDO" : "EN_CORRECCION",
        fechaCorreccion: finalizar ? new Date() : null,
      },
    });
  });
  return obtenerEntregaProfesor(user, entregaId);
}

export type ExamenProfesorDetalle = Awaited<ReturnType<typeof obtenerExamenProfesor>>;
export type EntregaProfesorDetalle = Awaited<ReturnType<typeof obtenerEntregaProfesor>>;
export type FilaEntrega = Awaited<ReturnType<typeof listarEntregasExamen>>[number];
