import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth";
import { parsearDiagrama } from "@/lib/diagrama";
import { badRequest, conflict, forbidden, notFound, validationError } from "@/lib/http";
import {
  cerrarEntregasVencidas,
  completarRespuestas,
  consignasDelTema,
  estaVencida,
  fechaLimite,
} from "@/lib/services/entregas";
import { entregaSchema, seleccionTemaSchema, type EntregaInput } from "@/lib/validations/entrega";

// El alumno solo accede a exámenes PUBLICADOS de SU CLASE ACTUAL. Si cambia de clase, conserva
// el acceso de solo lectura a lo que ya entregó (historial), pero no ve exámenes nuevos de la
// clase anterior. La identidad sale siempre del usuario autenticado, nunca del body, y todo id
// que llega del cliente (tema, consignas) se valida contra el examen en el servidor.

const YA_ENTREGADO = "Ya entregaste este examen. No se puede enviar ni editar nuevamente.";

const esUnico = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Clase actual del alumno (o null si todavía no fue agregado a ninguna). */
export async function claseDelAlumno(alumnoId: string) {
  const inscripcion = await prisma.inscripcionClase.findUnique({
    where: { alumnoId },
    select: { clase: { select: { id: true, nombre: true, profesor: { select: { nombre: true } } } } },
  });
  return inscripcion?.clase ?? null;
}

export async function listarExamenesAlumno(user: AuthUser) {
  const clase = await claseDelAlumno(user.id);
  await cerrarEntregasVencidas({ alumnoId: user.id });
  const examenes = await prisma.examen.findMany({
    where: {
      estado: "PUBLICADO",
      OR: [
        // Asignación por clase: lo ven todos los alumnos que hoy están en la clase.
        ...(clase ? [{ claseId: clase.id }] : []),
        // Historial: lo que ya entregó, aunque después haya cambiado de clase.
        { entregas: { some: { alumnoId: user.id, estado: { not: "EN_CURSO" as const } } } },
      ],
    },
    orderBy: { fechaPublicacion: "desc" },
    select: {
      id: true,
      titulo: true,
      modo: true,
      fechaPublicacion: true,
      fechaDisponible: true,
      duracionMinutos: true,
      habilitarEscritura: true,
      habilitarCalculadora: true,
      habilitarGeoGebra: true,
      profesor: { select: { nombre: true } },
      clase: { select: { nombre: true } },
      _count: { select: { consignas: true, temas: true } },
      entregas: {
        where: { alumnoId: user.id },
        select: { estado: true, fechaInicio: true, fechaEntrega: true, tema: { select: { nombre: true, titulo: true } } },
      },
    },
  });
  const ahora = new Date();
  return examenes.map(({ entregas, ...e }) => {
    const entrega = entregas[0];
    const entregado = entrega !== undefined && entrega.estado !== "EN_CURSO";
    return {
      ...e,
      entregado,
      /** Comenzó a resolver y todavía no entregó. */
      enCurso: entrega?.estado === "EN_CURSO" && entrega.fechaInicio !== null,
      disponible: !e.fechaDisponible || e.fechaDisponible <= ahora,
      fechaEntrega: entregado ? entrega.fechaEntrega : null,
      tema: entrega?.tema ?? null,
    };
  });
}

/**
 * Carga un examen para el alumno. 404 si no existe o es borrador (un borrador no existe para el
 * alumno); 403 si no es de su clase y tampoco lo entregó antes.
 */
async function cargarExamenAccesible(user: AuthUser, examenId: string) {
  const examen = await prisma.examen.findUnique({
    where: { id: examenId },
    include: {
      consignas: { orderBy: { orden: "asc" } },
      temas: { orderBy: { orden: "asc" }, include: { _count: { select: { consignas: true } } } },
      profesor: { select: { nombre: true } },
      clase: { select: { id: true, nombre: true } },
    },
  });
  if (!examen || examen.estado !== "PUBLICADO") throw notFound("Examen no encontrado");
  const [clase, entrega] = await Promise.all([
    claseDelAlumno(user.id),
    prisma.entrega.findUnique({
      where: { examenId_alumnoId: { examenId, alumnoId: user.id } },
      include: { respuestas: true },
    }),
  ]);
  const enSuClase = examen.claseId !== null && clase?.id === examen.claseId;
  const historial = entrega !== null && entrega.estado !== "EN_CURSO";
  if (!enSuClase && !historial) throw forbidden("Este examen no está asignado a tu clase");
  return { examen, entrega, enSuClase };
}

type Accesible = Awaited<ReturnType<typeof cargarExamenAccesible>>;

/** Las operaciones de escritura exigen pertenecer HOY a la clase del examen. */
function exigirClase({ enSuClase }: Accesible) {
  if (!enSuClase) throw forbidden("Este examen no está asignado a tu clase");
}

function exigirDisponible(examen: Accesible["examen"]) {
  if (examen.fechaDisponible && examen.fechaDisponible > new Date()) {
    throw conflict("El examen todavía no está disponible");
  }
}

export async function obtenerExamenAlumno(user: AuthUser, examenId: string) {
  await cerrarEntregasVencidas({ examenId, alumnoId: user.id });
  const { examen, entrega } = await cargarExamenAccesible(user, examenId);
  const temaId = entrega?.temaId ?? null;
  // Las consignas recién se envían cuando el alumno comenzó (o ya entregó): así no puede leerlas
  // antes de que empiece a correr su tiempo. En exámenes por temas, solo las de su tema.
  const comenzado = entrega !== null && (entrega.fechaInicio !== null || entrega.estado !== "EN_CURSO");
  const propias = consignasDelTema(examen, temaId);
  const tema = temaId ? examen.temas.find((t) => t.id === temaId) : undefined;

  return {
    id: examen.id,
    titulo: examen.titulo,
    enunciado: examen.enunciado,
    profesor: examen.profesor.nombre,
    clase: examen.clase?.nombre ?? null,
    modo: examen.modo,
    fechaPublicacion: examen.fechaPublicacion,
    fechaDisponible: examen.fechaDisponible,
    duracionMinutos: examen.duracionMinutos,
    disponible: !examen.fechaDisponible || examen.fechaDisponible <= new Date(),
    habilitarEscritura: examen.habilitarEscritura,
    habilitarCalculadora: examen.habilitarCalculadora,
    habilitarGeoGebra: examen.habilitarGeoGebra,
    // Temas para elegir (sin sus consignas).
    temas: examen.temas.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      titulo: t.titulo,
      descripcion: t.descripcion,
      preguntas: t._count.consignas,
    })),
    tema: tema ? { id: tema.id, nombre: tema.nombre, titulo: tema.titulo, descripcion: tema.descripcion } : null,
    cantidadConsignas: examen.modo === "NORMAL" || temaId ? propias.length : null,
    // Nunca se envían al alumno la respuesta correcta ni el criterio de corrección.
    consignas: comenzado
      ? propias.map((c, i) => ({
          id: c.id,
          orden: examen.modo === "POR_TEMAS" ? i + 1 : c.orden,
          texto: c.texto,
          puntaje: c.puntaje,
          tipo: c.tipo,
          opciones: c.opciones,
        }))
      : [],
    entrega: entrega
      ? {
          id: entrega.id,
          estado: entrega.estado,
          temaId: entrega.temaId,
          fechaInicio: entrega.fechaInicio,
          fechaLimite: fechaLimite(examen.duracionMinutos, entrega.fechaInicio),
          fechaEntrega: entrega.fechaEntrega,
          geogebraState: entrega.geogebraState,
          // Las notas y el feedback no se exponen al alumno en este Sprint.
          respuestas: entrega.respuestas.map((r) => {
            const diagrama = parsearDiagrama(r.diagrama);
            return {
              consignaId: r.consignaId,
              texto: r.texto,
              ...(r.opcionSeleccionada !== null ? { opcionSeleccionada: r.opcionSeleccionada } : {}),
              ...(diagrama ? { diagrama } : {}),
            };
          }),
        }
      : null,
  };
}

/**
 * Elige (o cambia) el tema de un examen POR_TEMAS. Se puede cambiar solo mientras el alumno no
 * haya comenzado: a partir de `fechaInicio` el tema queda bloqueado.
 */
export async function seleccionarTema(user: AuthUser, examenId: string, body: unknown) {
  const parsed = seleccionTemaSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const acceso = await cargarExamenAccesible(user, examenId);
  const { examen, entrega } = acceso;
  if (entrega && entrega.estado !== "EN_CURSO") throw conflict(YA_ENTREGADO);
  exigirClase(acceso);
  if (examen.modo !== "POR_TEMAS") throw badRequest("Este examen no tiene temas para elegir");

  // El tema se busca entre los del examen: un id de otro examen no existe acá.
  const tema = examen.temas.find((t) => t.id === parsed.data.temaId);
  if (!tema) throw badRequest("El tema elegido no pertenece a este examen", [{ campo: "temaId", mensaje: "Tema inválido" }]);
  if (entrega?.fechaInicio) throw conflict("Ya comenzaste el examen: el tema elegido no se puede cambiar");

  let creada = false;
  if (!entrega) {
    try {
      await prisma.entrega.create({
        data: { examenId, alumnoId: user.id, estado: "EN_CURSO", fechaEntrega: null, temaId: tema.id },
      });
      creada = true;
    } catch (error) {
      if (!esUnico(error)) throw error; // otra pestaña la creó en el medio: se sigue como cambio de tema
    }
  }
  if (!creada) {
    // Condicionado a que siga sin comenzar: dos pedidos simultáneos no pueden saltear el bloqueo.
    const { count } = await prisma.entrega.updateMany({
      where: { examenId, alumnoId: user.id, estado: "EN_CURSO", fechaInicio: null },
      data: { temaId: tema.id },
    });
    if (count === 0) throw conflict("Ya comenzaste el examen: el tema elegido no se puede cambiar");
  }
  return { tema: { id: tema.id, nombre: tema.nombre, titulo: tema.titulo } };
}

/** Comienza el examen: registra `fechaInicio` (bloquea el tema y arranca el tiempo, si lo hay). */
export async function iniciarExamen(user: AuthUser, examenId: string) {
  const acceso = await cargarExamenAccesible(user, examenId);
  const { examen, entrega } = acceso;
  if (entrega && entrega.estado !== "EN_CURSO") throw conflict(YA_ENTREGADO);
  exigirClase(acceso);
  exigirDisponible(examen);
  if (examen.modo === "POR_TEMAS" && !entrega?.temaId) throw conflict("Elegí un tema antes de comenzar");

  const respuesta = (fechaInicio: Date) => ({
    fechaInicio,
    fechaLimite: fechaLimite(examen.duracionMinutos, fechaInicio),
  });
  if (entrega?.fechaInicio) return respuesta(entrega.fechaInicio); // idempotente

  const ahora = new Date();
  if (!entrega) {
    try {
      await prisma.entrega.create({
        data: { examenId, alumnoId: user.id, estado: "EN_CURSO", fechaEntrega: null, fechaInicio: ahora },
      });
      return respuesta(ahora);
    } catch (error) {
      if (!esUnico(error)) throw error;
    }
  }
  await prisma.entrega.updateMany({
    where: { examenId, alumnoId: user.id, estado: "EN_CURSO", fechaInicio: null },
    data: { fechaInicio: ahora },
  });
  const actual = await prisma.entrega.findUniqueOrThrow({ where: { examenId_alumnoId: { examenId, alumnoId: user.id } } });
  if (actual.estado !== "EN_CURSO") throw conflict(YA_ENTREGADO);
  return respuesta(actual.fechaInicio!);
}

/** Valida que cada respuesta corresponda a una consigna del alumno y a su tipo. */
function validarRespuestas(
  examen: Accesible["examen"],
  propias: Accesible["examen"]["consignas"],
  { respuestas, geogebraState }: EntregaInput,
) {
  const consignasPorId = new Map(propias.map((c) => [c.id, c]));
  const delExamen = new Set(examen.consignas.map((c) => c.id));
  for (const r of respuestas) {
    if (!consignasPorId.has(r.consignaId)) {
      throw badRequest(
        delExamen.has(r.consignaId)
          ? "Hay respuestas para consignas que no corresponden al tema elegido"
          : "Hay respuestas para consignas que no pertenecen a este examen",
      );
    }
  }
  // Cada respuesta debe corresponder al tipo de su consigna.
  for (const r of respuestas) {
    const consigna = consignasPorId.get(r.consignaId)!;
    const tipo = consigna.tipo;
    const tieneOpcion = r.opcion !== undefined && r.opcion !== null;
    const tieneDiagrama = r.diagrama !== undefined && r.diagrama !== null;
    if (tipo !== "DESARROLLO" && r.texto.trim() !== "") {
      throw badRequest("Solo las consignas de desarrollo admiten respuesta escrita");
    }
    if (tieneOpcion) {
      if (tipo !== "OPCION_MULTIPLE" && tipo !== "VERDADERO_FALSO") throw badRequest("Esta consigna no es de opciones");
      if (r.opcion! >= consigna.opciones.length) throw badRequest("La opción elegida no existe");
    }
    if (tieneDiagrama && tipo !== "DIAGRAMA") throw badRequest("Esta consigna no es de diagrama");
  }
  // Las herramientas deshabilitadas no pueden usarse aunque el cliente lo intente.
  if (!examen.habilitarEscritura && respuestas.some((r) => r.texto.trim() !== "")) {
    throw badRequest("La escritura no está habilitada en este examen");
  }
  if (!examen.habilitarGeoGebra && geogebraState) {
    throw badRequest("GeoGebra no está habilitado en este examen");
  }
}

const datosRespuesta = (r: EntregaInput["respuestas"][number]) => ({
  texto: r.texto,
  opcionSeleccionada: r.opcion ?? null,
  diagrama: r.diagrama ? (r.diagrama as unknown as Prisma.InputJsonObject) : Prisma.DbNull,
});

/** Si se agotó el tiempo, la entrega se cierra con lo guardado y se informa al alumno. */
async function rechazarSiVencida(examen: Accesible["examen"], entrega: Accesible["entrega"]) {
  if (entrega && entrega.estado === "EN_CURSO" && estaVencida(examen.duracionMinutos, entrega.fechaInicio)) {
    await cerrarEntregasVencidas({ examenId: examen.id, alumnoId: entrega.alumnoId });
    throw conflict("Se terminó el tiempo del examen: se entregaron las respuestas guardadas hasta ese momento.");
  }
}

/**
 * Guarda el avance (borrador) en el servidor mientras el examen está EN_CURSO. Requiere haber
 * comenzado: en un examen por temas, guardar respuestas implica que el tema ya está bloqueado.
 */
export async function guardarRespuestas(user: AuthUser, examenId: string, body: unknown) {
  const parsed = entregaSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const acceso = await cargarExamenAccesible(user, examenId);
  const { examen, entrega } = acceso;
  if (entrega && entrega.estado !== "EN_CURSO") throw conflict(YA_ENTREGADO);
  exigirClase(acceso);
  if (!entrega?.fechaInicio) throw conflict("Primero tenés que comenzar el examen");
  await rechazarSiVencida(examen, entrega);
  validarRespuestas(examen, consignasDelTema(examen, entrega.temaId), parsed.data);

  const { respuestas, geogebraState } = parsed.data;
  await prisma.$transaction(async (tx) => {
    // Si en el medio se entregó, no se pisa nada.
    const { count } = await tx.entrega.updateMany({
      where: { id: entrega.id, estado: "EN_CURSO" },
      data: geogebraState !== undefined && examen.habilitarGeoGebra ? { geogebraState } : { updatedAt: new Date() },
    });
    if (count === 0) throw conflict(YA_ENTREGADO);
    for (const r of respuestas) {
      await tx.respuesta.upsert({
        where: { entregaId_consignaId: { entregaId: entrega.id, consignaId: r.consignaId } },
        update: datosRespuesta(r),
        create: { entregaId: entrega.id, consignaId: r.consignaId, ...datosRespuesta(r) },
      });
    }
  });
  return { guardado: new Date() };
}

/**
 * Entrega definitiva. En un examen NORMAL se puede entregar directamente (crea la entrega) o
 * después de comenzar. En uno POR_TEMAS exige haber elegido tema y solo acepta sus consignas.
 * El UNIQUE(examenId, alumnoId) y la transición condicionada EN_CURSO → ENTREGADO garantizan
 * una única entrega aunque lleguen envíos simultáneos.
 */
export async function enviarEntrega(user: AuthUser, examenId: string, body: unknown) {
  const parsed = entregaSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const { respuestas, geogebraState } = parsed.data;

  const acceso = await cargarExamenAccesible(user, examenId);
  const { examen, entrega } = acceso;
  if (entrega && entrega.estado !== "EN_CURSO") throw conflict(YA_ENTREGADO);
  exigirClase(acceso);
  exigirDisponible(examen);
  if (examen.modo === "POR_TEMAS" && !entrega?.temaId) throw conflict("Elegí un tema antes de entregar");
  await rechazarSiVencida(examen, entrega);

  const propias = consignasDelTema(examen, entrega?.temaId);
  validarRespuestas(examen, propias, parsed.data);

  const ahora = new Date();
  try {
    // Entrega + respuestas en una única transacción: o se guarda todo o nada.
    return await prisma.$transaction(async (tx) => {
      const datos = {
        estado: "ENTREGADO" as const,
        fechaEntrega: ahora,
        geogebraState: examen.habilitarGeoGebra ? (geogebraState ?? entrega?.geogebraState ?? null) : null,
      };
      let entregaId: string;
      if (!entrega) {
        const nueva = await tx.entrega.create({ data: { examenId, alumnoId: user.id, fechaInicio: ahora, ...datos } });
        entregaId = nueva.id;
      } else {
        const { count } = await tx.entrega.updateMany({
          where: { id: entrega.id, estado: "EN_CURSO" },
          data: { ...datos, fechaInicio: entrega.fechaInicio ?? ahora },
        });
        if (count === 0) throw conflict(YA_ENTREGADO);
        entregaId = entrega.id;
      }
      // Lo enviado ahora pisa el avance guardado; lo que no se envía conserva lo último guardado.
      for (const r of respuestas) {
        await tx.respuesta.upsert({
          where: { entregaId_consignaId: { entregaId, consignaId: r.consignaId } },
          update: datosRespuesta(r),
          create: { entregaId, consignaId: r.consignaId, ...datosRespuesta(r) },
        });
      }
      // Respuestas vacías para lo no respondido + sugerencias automáticas (opciones / V-F).
      await completarRespuestas(tx, entregaId, propias);
      return { id: entregaId, estado: datos.estado, fechaEntrega: ahora };
    });
  } catch (error) {
    // Dos envíos simultáneos: el UNIQUE(examenId, alumnoId) de la base rechaza el segundo.
    if (esUnico(error)) throw conflict(YA_ENTREGADO);
    throw error;
  }
}

export type ExamenAlumnoDetalle = Awaited<ReturnType<typeof obtenerExamenAlumno>>;
export type ExamenAlumnoResumen = Awaited<ReturnType<typeof listarExamenesAlumno>>[number];
