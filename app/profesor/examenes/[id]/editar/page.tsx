import Link from "next/link";
import { Lock } from "lucide-react";
import ExamenForm from "@/components/profesor/ExamenForm";
import EmptyState from "@/components/ui/EmptyState";
import { cargarOFallar } from "@/lib/page-load";
import { requireRole } from "@/lib/session";
import { listarClasesProfesor } from "@/lib/services/clases";
import { obtenerExamenProfesor } from "@/lib/services/profesor";

export default async function EditarExamenPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("PROFESOR");
  const { id } = await params;
  const [examen, clases] = await Promise.all([
    cargarOFallar(() => obtenerExamenProfesor(user, id)),
    listarClasesProfesor(user),
  ]);

  if (examen.estado !== "BORRADOR") {
    return (
      <div className="container-narrow">
        <EmptyState
          icon={Lock}
          titulo="Este examen ya fue publicado"
          descripcion="Las preguntas y los temas de un examen publicado no pueden editarse. Mientras nadie lo haya comenzado, todavía podés cambiar la clase desde el detalle."
          accion={
            <Link className="btn btn-secondary" href={`/profesor/examenes/${examen.id}`}>
              Volver al examen
            </Link>
          }
        />
      </div>
    );
  }

  const aInicial = (c: (typeof examen.consignas)[number]) => ({
    texto: c.texto,
    puntaje: c.puntaje,
    tipo: c.tipo,
    opciones: c.opciones,
    respuestaCorrecta: c.respuestaCorrecta,
    criterio: c.criterio,
  });

  return (
    <div className="layout-wide">
      <h1 className="sr-only">Editar examen</h1>
      <ExamenForm
        clases={clases.map((c) => ({ id: c.id, nombre: c.nombre, alumnos: c.alumnos }))}
        inicial={{
          id: examen.id,
          titulo: examen.titulo,
          enunciado: examen.enunciado,
          modo: examen.modo,
          habilitarEscritura: examen.habilitarEscritura,
          habilitarCalculadora: examen.habilitarCalculadora,
          habilitarGeoGebra: examen.habilitarGeoGebra,
          claseId: examen.claseId,
          fechaDisponible: examen.fechaDisponible?.toISOString() ?? null,
          duracionMinutos: examen.duracionMinutos,
          consignas: examen.modo === "NORMAL" ? examen.consignas.map(aInicial) : [],
          temas: examen.temas.map((t) => ({
            nombre: t.nombre,
            titulo: t.titulo,
            descripcion: t.descripcion,
            consignas: examen.consignas.filter((c) => c.temaId === t.id).map(aInicial),
          })),
        }}
      />
    </div>
  );
}
