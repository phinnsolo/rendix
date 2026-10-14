import { notFound } from "next/navigation";
import CorreccionEntrega from "@/components/profesor/CorreccionEntrega";
import GeoGebraApplet from "@/components/tools/GeoGebraApplet";
import { cargarOFallar } from "@/lib/page-load";
import { requireRole } from "@/lib/session";
import { listarEntregasExamen, obtenerEntregaProfesor } from "@/lib/services/profesor";

export default async function EntregaProfesorPage({ params }: { params: Promise<{ id: string; entregaId: string }> }) {
  const user = await requireRole("PROFESOR");
  const { id, entregaId } = await params;
  // El servicio verifica que la entrega sea de un examen de este profesor.
  const entrega = await cargarOFallar(() => obtenerEntregaProfesor(user, entregaId));
  if (entrega.examen.id !== id) notFound();

  // Navegación rápida entre los alumnos que entregaron este examen.
  const entregados = (await listarEntregasExamen(user, id)).filter((e) => e.entregaId);
  const i = entregados.findIndex((e) => e.entregaId === entregaId);
  const enlace = (e: (typeof entregados)[number] | undefined) =>
    e ? { href: `/profesor/examenes/${id}/entregas/${e.entregaId}`, nombre: e.alumno.nombre } : null;

  return (
    <div className="layout-wide">
      <CorreccionEntrega
        key={entrega.id}
        entrega={entrega}
        navegacion={{
          posicion: i + 1,
          total: entregados.length,
          anterior: enlace(entregados[i - 1]),
          siguiente: enlace(entregados[i + 1]),
          volver: `/profesor/examenes/${id}#entregas`,
        }}
        anexos={
          entrega.examen.habilitarGeoGebra ? (
            <details className="grading-block grading-annex">
              <summary className="grading-block-title">Gráfico de GeoGebra del alumno</summary>
              {entrega.geogebraState ? (
                <GeoGebraApplet initialState={entrega.geogebraState} readOnly height={420} />
              ) : (
                <p className="muted small">No se guardó ningún gráfico.</p>
              )}
            </details>
          ) : undefined
        }
      />
    </div>
  );
}
