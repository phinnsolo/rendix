import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth";
import { aprobado, estadoExamenUI, notaSobre10 } from "@/lib/estados";
import { consignasDelTema, puntajeMaximoEntrega } from "@/lib/services/entregas";
import { obtenerExamenProfesor } from "@/lib/services/profesor";

// Consultas de SOLO LECTURA para las vistas del panel del profesor (inicio, listados, resultados).
// No modifican datos: igual que el resto de los servicios, filtran siempre por el profesor autenticado.
// Las entregas EN_CURSO (el alumno eligió tema o está resolviendo) todavía no cuentan como entregas.

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const promedio = (xs: number[]) => (xs.length ? suma(xs) / xs.length : null);
const redondear = (v: number | null, dec = 1) => (v === null ? null : Math.round(v * 10 ** dec) / 10 ** dec);

const ENVIADAS = { estado: { not: "EN_CURSO" as const } };

export async function contarPendientesCorreccion(user: AuthUser) {
  return prisma.entrega.count({
    where: { examen: { profesorId: user.id }, estado: { in: ["ENTREGADO", "EN_CORRECCION"] } },
  });
}

/** Exámenes del profesor con contadores de entregas y estado de presentación. */
export async function resumenExamenes(user: AuthUser) {
  const examenes = await prisma.examen.findMany({
    where: { profesorId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      titulo: true,
      estado: true,
      modo: true,
      fechaCreacion: true,
      fechaPublicacion: true,
      fechaDisponible: true,
      duracionMinutos: true,
      updatedAt: true,
      clase: { select: { id: true, nombre: true, _count: { select: { inscripciones: true } } } },
      _count: { select: { temas: true } },
      consignas: { select: { id: true, puntaje: true, tipo: true, temaId: true, orden: true } },
      entregas: { where: ENVIADAS, select: { estado: true, notaTotal: true, fechaEntrega: true, temaId: true } },
    },
  });
  return examenes.map((e) => {
    const corregidas = e.entregas.filter((x) => x.estado === "CORREGIDO");
    const porTemas = e.modo === "POR_TEMAS";
    // En un examen por temas el máximo depende del tema: se informa el mayor y los promedios van sobre 10.
    const maximos = porTemas
      ? [...new Set(e.consignas.map((c) => c.temaId))].map((t) => puntajeMaximoEntrega(e, t))
      : [suma(e.consignas.map((c) => c.puntaje))];
    const notas = corregidas
      .filter((x) => x.notaTotal !== null)
      .map((x) => (porTemas ? notaSobre10(x.notaTotal!, puntajeMaximoEntrega(e, x.temaId)) : x.notaTotal!));
    const ultimaEntrega = e.entregas.reduce<Date | null>(
      (max, x) => (x.fechaEntrega && (!max || x.fechaEntrega > max) ? x.fechaEntrega : max),
      null,
    );
    const asignados = e.clase?._count.inscripciones ?? 0;
    return {
      id: e.id,
      titulo: e.titulo,
      estado: e.estado,
      modo: e.modo,
      clase: e.clase ? { id: e.clase.id, nombre: e.clase.nombre } : null,
      fechaCreacion: e.fechaCreacion,
      fechaPublicacion: e.fechaPublicacion,
      fechaDisponible: e.fechaDisponible,
      duracionMinutos: e.duracionMinutos,
      actualizado: e.updatedAt,
      preguntas: e.consignas.length,
      temas: e._count.temas,
      tipos: [...new Set(e.consignas.map((c) => c.tipo))],
      puntajeMaximo: Math.max(0, ...maximos),
      asignados,
      entregas: e.entregas.length,
      corregidas: corregidas.length,
      pendientes: e.entregas.length - corregidas.length,
      promedio: redondear(promedio(notas)),
      /** true = el promedio está expresado sobre 10 (exámenes por temas). */
      promedioSobre10: porTemas,
      ultimaEntrega,
      estadoUI: estadoExamenUI({ estado: e.estado, asignados, entregas: e.entregas.length, corregidas: corregidas.length }),
    };
  });
}

export type ResumenExamen = Awaited<ReturnType<typeof resumenExamenes>>[number];

export async function contarAlumnosEvaluados(user: AuthUser) {
  const grupos = await prisma.entrega.groupBy({
    by: ["alumnoId"],
    where: { examen: { profesorId: user.id }, estado: "CORREGIDO" },
  });
  return grupos.length;
}

/** Entregas enviadas de los exámenes del profesor (bandeja de corrección). */
export async function bandejaCorrecciones(user: AuthUser) {
  const entregas = await prisma.entrega.findMany({
    where: { examen: { profesorId: user.id }, ...ENVIADAS },
    orderBy: { fechaEntrega: "asc" },
    select: {
      id: true,
      estado: true,
      fechaEntrega: true,
      fechaCorreccion: true,
      notaTotal: true,
      temaId: true,
      tema: { select: { nombre: true, titulo: true } },
      alumno: { select: { id: true, nombre: true, email: true } },
      examen: {
        select: { id: true, titulo: true, modo: true, consignas: { select: { id: true, puntaje: true, temaId: true, orden: true } } },
      },
    },
  });
  return entregas.map(({ examen, temaId, fechaEntrega, estado, ...e }) => ({
    ...e,
    // EN_CURSO está excluido por la consulta: lo que queda siempre tiene fecha de entrega.
    estado: estado as "ENTREGADO" | "EN_CORRECCION" | "CORREGIDO",
    fechaEntrega: fechaEntrega!,
    examen: { id: examen.id, titulo: examen.titulo, puntajeMaximo: puntajeMaximoEntrega(examen, temaId) },
  }));
}

export type EntregaBandeja = Awaited<ReturnType<typeof bandejaCorrecciones>>[number];

export type EstadoAlumno = "CORRECCION_PENDIENTE" | "EXAMEN_PENDIENTE" | "AL_DIA" | "SIN_ACTIVIDAD";

/**
 * Alumnos relevantes para el profesor (los de sus clases, los que no tienen clase y los que
 * entregaron alguno de sus exámenes) con su clase y su actividad.
 */
export async function alumnosConResumen(user: AuthUser) {
  const [alumnos, examenesPublicados] = await Promise.all([
    prisma.usuario.findMany({
      where: {
        rol: "ALUMNO",
        OR: [
          { inscripcion: { is: null } },
          { inscripcion: { clase: { profesorId: user.id } } },
          { entregas: { some: { examen: { profesorId: user.id }, ...ENVIADAS } } },
        ],
      },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        email: true,
        inscripcion: { select: { clase: { select: { id: true, nombre: true, profesorId: true } } } },
        entregas: {
          where: { examen: { profesorId: user.id }, ...ENVIADAS },
          select: {
            examenId: true,
            estado: true,
            notaTotal: true,
            fechaEntrega: true,
            temaId: true,
            examen: { select: { modo: true, consignas: { select: { id: true, puntaje: true, temaId: true, orden: true } } } },
          },
        },
      },
    }),
    prisma.examen.findMany({
      where: { profesorId: user.id, estado: "PUBLICADO", claseId: { not: null } },
      select: { id: true, claseId: true },
    }),
  ]);
  return alumnos.map((a) => {
    const clase = a.inscripcion?.clase ?? null;
    const propia = clase !== null && clase.profesorId === user.id;
    const entregados = new Set(a.entregas.map((e) => e.examenId));
    // Exámenes que hoy le corresponden por su clase.
    const deSuClase = propia ? examenesPublicados.filter((e) => e.claseId === clase.id) : [];
    const pendientesRendir = deSuClase.filter((e) => !entregados.has(e.id)).length;
    const pendientesCorreccion = a.entregas.filter((e) => e.estado !== "CORREGIDO").length;
    const notas = a.entregas
      .filter((e) => e.estado === "CORREGIDO" && e.notaTotal !== null)
      .map((e) => notaSobre10(e.notaTotal!, puntajeMaximoEntrega(e.examen, e.temaId)));
    const estado: EstadoAlumno =
      pendientesCorreccion > 0
        ? "CORRECCION_PENDIENTE"
        : pendientesRendir > 0
          ? "EXAMEN_PENDIENTE"
          : a.entregas.length > 0
            ? "AL_DIA"
            : "SIN_ACTIVIDAD";
    return {
      id: a.id,
      nombre: a.nombre,
      email: a.email,
      clase: propia ? { id: clase.id, nombre: clase.nombre } : null,
      otraCatedra: clase !== null && !propia,
      asignados: new Set([...deSuClase.map((e) => e.id), ...entregados]).size,
      realizados: a.entregas.length,
      pendientesRendir,
      pendientesCorreccion,
      promedio: redondear(promedio(notas)),
      ultimaEntrega: a.entregas.reduce<Date | null>(
        (m, e) => (e.fechaEntrega && (!m || e.fechaEntrega > m) ? e.fechaEntrega : m),
        null,
      ),
      estado,
    };
  });
}

export type AlumnoResumen = Awaited<ReturnType<typeof alumnosConResumen>>[number];

/** Todas las preguntas de los exámenes del profesor, con su rendimiento promedio. */
export async function bancoPreguntas(user: AuthUser) {
  const [consignas, promedios] = await Promise.all([
    prisma.consigna.findMany({
      where: { examen: { profesorId: user.id } },
      orderBy: [{ examen: { fechaCreacion: "desc" } }, { orden: "asc" }],
      select: {
        id: true,
        texto: true,
        tipo: true,
        puntaje: true,
        orden: true,
        opciones: true,
        criterio: true,
        tema: { select: { nombre: true, titulo: true } },
        examen: { select: { id: true, titulo: true, estado: true } },
      },
    }),
    prisma.respuesta.groupBy({
      by: ["consignaId"],
      where: { consigna: { examen: { profesorId: user.id } }, puntajeObtenido: { not: null } },
      _avg: { puntajeObtenido: true },
      _count: { puntajeObtenido: true },
    }),
  ]);
  const porConsigna = new Map(promedios.map((p) => [p.consignaId, p]));
  return consignas.map((c) => {
    const p = porConsigna.get(c.id);
    const avg = p?._avg.puntajeObtenido ?? null;
    return {
      ...c,
      corregidas: p?._count.puntajeObtenido ?? 0,
      rendimiento: avg !== null && c.puntaje > 0 ? Math.round((avg / c.puntaje) * 100) : null,
    };
  });
}

export type PreguntaBanco = Awaited<ReturnType<typeof bancoPreguntas>>[number];

/**
 * Estadísticas de un examen. Usa las entregas CORREGIDAS para las notas y todos los puntajes
 * asignados por pregunta. En exámenes por temas cada alumno tiene un máximo distinto (el de su
 * tema), así que las notas se expresan sobre 10 y se agregan estadísticas por tema.
 */
export async function resultadosExamen(user: AuthUser, examenId: string) {
  const examen = await obtenerExamenProfesor(user, examenId); // verifica propiedad (404 / 403)
  const porTemas = examen.modo === "POR_TEMAS";
  const entregas = await prisma.entrega.findMany({
    where: { examenId, ...ENVIADAS },
    select: {
      id: true,
      estado: true,
      notaTotal: true,
      temaId: true,
      alumno: { select: { id: true, nombre: true, email: true } },
      respuestas: { select: { consignaId: true, puntajeObtenido: true } },
    },
    orderBy: { alumno: { nombre: "asc" } },
  });

  const puntajeMaximo = porTemas ? 10 : suma(examen.consignas.map((c) => c.puntaje));
  /** Nota en la escala del reporte: puntos (examen normal) o sobre 10 (por temas). */
  const escalar = (nota: number, temaId: string | null) =>
    porTemas ? notaSobre10(nota, puntajeMaximoEntrega(examen, temaId)) : nota;

  const corregidas = entregas.filter((e) => e.estado === "CORREGIDO" && e.notaTotal !== null);
  const notas = corregidas.map((e) => escalar(e.notaTotal!, e.temaId));
  const aprobados = notas.filter((n) => aprobado(n, puntajeMaximo)).length;

  // Distribución de notas en escala 0–10, en 5 rangos.
  const rangos = [
    { label: "0–2", min: 0, max: 2 },
    { label: "2–4", min: 2, max: 4 },
    { label: "4–6", min: 4, max: 6 },
    { label: "6–8", min: 6, max: 8 },
    { label: "8–10", min: 8, max: 10.01 },
  ];
  const distribucion = rangos.map((r) => ({
    label: r.label,
    cantidad: notas.filter((n) => {
      const v = notaSobre10(n, puntajeMaximo);
      return v >= r.min && v < r.max;
    }).length,
  }));

  const temas = new Map(examen.temas.map((t) => [t.id, t]));
  const posicionEnTema = new Map(
    examen.temas.flatMap((t) => consignasDelTema(examen, t.id).map((c, i) => [c.id, i + 1] as const)),
  );
  const porPregunta = examen.consignas.map((c) => {
    const puntajes = entregas
      .map((e) => e.respuestas.find((r) => r.consignaId === c.id)?.puntajeObtenido)
      .filter((p): p is number => p !== null && p !== undefined);
    const prom = promedio(puntajes);
    const tema = c.temaId ? temas.get(c.temaId) : undefined;
    const orden = posicionEnTema.get(c.id) ?? c.orden;
    return {
      id: c.id,
      orden,
      etiqueta: tema ? `T${tema.orden}·P${orden}` : `P${orden}`,
      tema: tema ? { nombre: tema.nombre, titulo: tema.titulo } : null,
      texto: c.texto,
      tipo: c.tipo,
      puntaje: c.puntaje,
      corregidas: puntajes.length,
      promedio: redondear(prom, 2),
      rendimiento: prom !== null && c.puntaje > 0 ? Math.round((prom / c.puntaje) * 100) : null,
    };
  });
  const conDatos = porPregunta.filter((p) => p.rendimiento !== null);
  const ordenadas = [...conDatos].sort((a, b) => a.rendimiento! - b.rendimiento!);
  const hayDiferencias = ordenadas.length > 1 && ordenadas[0].rendimiento! < ordenadas[ordenadas.length - 1].rendimiento!;

  // Por tema: cuántos alumnos lo eligieron (y entregaron) y su promedio sobre 10 si hay correcciones.
  const porTema = examen.temas.map((t) => {
    const delTema = entregas.filter((e) => e.temaId === t.id);
    const notasTema = delTema
      .filter((e) => e.estado === "CORREGIDO" && e.notaTotal !== null)
      .map((e) => notaSobre10(e.notaTotal!, puntajeMaximoEntrega(examen, t.id)));
    return {
      id: t.id,
      nombre: t.nombre,
      titulo: t.titulo,
      alumnos: delTema.length,
      corregidas: notasTema.length,
      promedioSobre10: redondear(promedio(notasTema)),
    };
  });

  return {
    examen: {
      id: examen.id,
      titulo: examen.titulo,
      estado: examen.estado,
      modo: examen.modo,
      fechaPublicacion: examen.fechaPublicacion,
      clase: examen.clase ? { id: examen.clase.id, nombre: examen.clase.nombre } : null,
    },
    /** En exámenes por temas las notas están expresadas sobre 10. */
    escalaSobre10: porTemas,
    puntajeMaximo,
    asignados: examen.clase?._count.inscripciones ?? 0,
    entregadas: entregas.length,
    corregidas: corregidas.length,
    promedio: redondear(promedio(notas), 2),
    promedioSobre10: notas.length ? notaSobre10(suma(notas) / notas.length, puntajeMaximo) : null,
    aprobados,
    desaprobados: notas.length - aprobados,
    distribucion,
    porPregunta,
    porTema,
    // Solo se destacan si hay diferencias reales de rendimiento entre preguntas.
    peorPregunta: hayDiferencias ? ordenadas[0] : null,
    mejorPregunta: hayDiferencias ? ordenadas[ordenadas.length - 1] : null,
    alumnos: entregas.map((e) => {
      const tema = e.temaId ? temas.get(e.temaId) : undefined;
      return {
        entregaId: e.id,
        alumno: e.alumno,
        estado: e.estado,
        tema: tema ? { nombre: tema.nombre, titulo: tema.titulo } : null,
        nota: e.notaTotal !== null ? redondear(escalar(e.notaTotal, e.temaId), 2) : null,
        aprobado:
          e.estado === "CORREGIDO" && e.notaTotal !== null ? aprobado(escalar(e.notaTotal, e.temaId), puntajeMaximo) : null,
      };
    }),
  };
}

export type ResultadosExamen = Awaited<ReturnType<typeof resultadosExamen>>;
