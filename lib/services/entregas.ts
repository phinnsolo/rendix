import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { corregirAutomaticamente, type TipoConsigna } from "@/lib/correccion";

// Reglas compartidas del ciclo de vida de una entrega (las usan los servicios del alumno y del profesor).
//
//   EN_CURSO   → el alumno eligió tema (POR_TEMAS) y/o comenzó (fechaInicio). Todavía no entregó.
//   ENTREGADO  → entrega definitiva, pendiente de corrección.
//   EN_CORRECCION / CORREGIDO → corrección del profesor.

/** Margen sobre la duración para absorber la latencia del envío automático al agotarse el tiempo. */
export const GRACIA_MS = 2 * 60_000;

interface ConsignaConTema {
  id: string;
  temaId: string | null;
  orden: number;
}

/**
 * Consignas que le corresponden a un alumno: todas en un examen NORMAL; solo las del tema elegido
 * en un examen POR_TEMAS (ninguna si todavía no eligió).
 */
export function consignasDelTema<C extends ConsignaConTema>(
  examen: { modo: "NORMAL" | "POR_TEMAS"; consignas: C[] },
  temaId: string | null | undefined,
): C[] {
  const ordenadas = [...examen.consignas].sort((a, b) => a.orden - b.orden);
  if (examen.modo === "NORMAL") return ordenadas;
  return temaId ? ordenadas.filter((c) => c.temaId === temaId) : [];
}

/** Momento en que se termina el tiempo del alumno (null = sin límite o todavía no comenzó). */
export function fechaLimite(duracionMinutos: number | null, fechaInicio: Date | null): Date | null {
  if (!duracionMinutos || !fechaInicio) return null;
  return new Date(fechaInicio.getTime() + duracionMinutos * 60_000);
}

export function estaVencida(duracionMinutos: number | null, fechaInicio: Date | null, ahora = new Date()): boolean {
  const limite = fechaLimite(duracionMinutos, fechaInicio);
  return limite !== null && ahora.getTime() > limite.getTime() + GRACIA_MS;
}

type Tx = Prisma.TransactionClient;

interface ConsignaCorregible extends ConsignaConTema {
  tipo: TipoConsigna;
  puntaje: number;
  opciones: string[];
  respuestaCorrecta: number | null;
}

/**
 * Completa las respuestas de una entrega que acaba de pasar a ENTREGADO: crea las que falten
 * (vacías) y calcula la sugerencia automática de las consignas de opciones.
 */
export async function completarRespuestas(tx: Tx, entregaId: string, consignas: ConsignaCorregible[]) {
  const existentes = await tx.respuesta.findMany({ where: { entregaId } });
  const porConsigna = new Map(existentes.map((r) => [r.consignaId, r]));
  for (const c of consignas) {
    const r = porConsigna.get(c.id);
    const opcionSeleccionada = r?.opcionSeleccionada ?? null;
    const sugerencia = corregirAutomaticamente(c, { opcionSeleccionada });
    const datosSugerencia = {
      puntajeSugerido: sugerencia?.puntaje ?? null,
      fuenteSugerencia: sugerencia?.fuente ?? null,
      sugerenciaDetalle: sugerencia?.detalle ?? null,
    };
    if (r) {
      await tx.respuesta.update({ where: { id: r.id }, data: datosSugerencia });
    } else {
      await tx.respuesta.create({ data: { entregaId, consignaId: c.id, texto: "", ...datosSugerencia } });
    }
  }
}

/**
 * Cierra las entregas EN_CURSO cuyo tiempo se agotó (más el margen de gracia): quedan ENTREGADAS
 * con lo último que el alumno guardó y fecha de entrega = fin del tiempo. Es idempotente y seguro
 * ante concurrencia (la transición está condicionada a estado = EN_CURSO).
 */
export async function cerrarEntregasVencidas(filtro: { examenId?: string; alumnoId?: string }) {
  const candidatas = await prisma.entrega.findMany({
    where: {
      ...filtro,
      estado: "EN_CURSO",
      fechaInicio: { not: null },
      examen: { duracionMinutos: { not: null } },
    },
    select: {
      id: true,
      temaId: true,
      fechaInicio: true,
      examen: { select: { modo: true, duracionMinutos: true, consignas: true } },
    },
  });
  const ahora = new Date();
  for (const e of candidatas) {
    if (!estaVencida(e.examen.duracionMinutos, e.fechaInicio, ahora)) continue;
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.entrega.updateMany({
        where: { id: e.id, estado: "EN_CURSO" },
        data: { estado: "ENTREGADO", fechaEntrega: fechaLimite(e.examen.duracionMinutos, e.fechaInicio)! },
      });
      if (count === 0) return;
      await completarRespuestas(tx, e.id, consignasDelTema(e.examen, e.temaId));
    });
  }
}

/** Puntaje máximo de una entrega: suma de las consignas que le correspondieron (según su tema). */
export function puntajeMaximoEntrega(
  examen: { modo: "NORMAL" | "POR_TEMAS"; consignas: (ConsignaConTema & { puntaje: number })[] },
  temaId: string | null | undefined,
): number {
  return consignasDelTema(examen, temaId).reduce((acc, c) => acc + c.puntaje, 0);
}
