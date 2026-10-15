import PreparacionExamen from "@/components/alumno/PreparacionExamen";
import ResolverExamen from "@/components/alumno/ResolverExamen";
import EntregaDetalle from "@/components/EntregaDetalle";
import { AlumnoExamStatus } from "@/components/EstadoBadge";
import { PageHeader } from "@/components/ui/Misc";
import { FlashToast } from "@/components/ui/Toast";
import { CircleCheck, Info } from "lucide-react";
import { formatFechaCorta } from "@/lib/format";
import { cargarOFallar } from "@/lib/page-load";
import { requireRole } from "@/lib/session";
import { obtenerExamenAlumno } from "@/lib/services/alumno";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ enviado?: string }>;
}

/**
 * Flujo del alumno, determinado por el servidor (no por la URL):
 *   NORMAL:     Entrar → Comenzar → Responder → Entregar
 *   POR_TEMAS:  Entrar → Elegir tema → Confirmar → Comenzar → Responder su tema → Entregar
 */
export default async function ExamenAlumnoPage({ params, searchParams }: Props) {
  const user = await requireRole("ALUMNO");
  const { id } = await params;
  const { enviado } = await searchParams;
  // El servicio verifica en el servidor que esté publicado y sea de la clase del alumno.
  const examen = await cargarOFallar(() => obtenerExamenAlumno(user, id));
  const entrega = examen.entrega;

  // 1) Todavía no comenzó: elegir tema (si corresponde) y comenzar.
  if (!entrega || (entrega.estado === "EN_CURSO" && !entrega.fechaInicio)) {
    return <PreparacionExamen key={entrega?.temaId ?? "sin-tema"} examen={examen} />;
  }

  // 2) En curso: resolver (solo las preguntas de su tema), con autoguardado en el servidor.
  if (entrega.estado === "EN_CURSO") {
    return (
      <ResolverExamen
        examen={examen}
        userId={user.id}
        tema={examen.tema}
        fechaLimite={entrega.fechaLimite ? entrega.fechaLimite.toISOString() : null}
        guardadoRemoto
        respuestasIniciales={entrega.respuestas}
        geogebraInicial={entrega.geogebraState}
      />
    );
  }

  // 3) Entregado: copia de solo lectura.
  const respuestaPorConsigna = new Map(entrega.respuestas.map((r) => [r.consignaId, r]));

  return (
    <div className="container-narrow stack-lg">
      {enviado && <FlashToast parametro="enviado" mensaje="Examen entregado correctamente" />}
      <PageHeader
        volver={{ href: "/alumno", label: "Mis exámenes" }}
        eyebrow={
          <span className="row" style={{ gap: "0.6rem" }}>
            <AlumnoExamStatus entregado />
            <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
              Entregado el {formatFechaCorta(entrega.fechaEntrega)}
            </span>
          </span>
        }
        titulo={examen.titulo}
        subtitulo={
          examen.tema
            ? `${examen.tema.nombre}${examen.tema.titulo ? ` - ${examen.tema.titulo}` : ""} · Profesor/a: ${examen.profesor}`
            : `Profesor/a: ${examen.profesor}`
        }
      />
      {enviado ? (
        <div className="alert alert-success" role="status">
          <CircleCheck className="icon" aria-hidden />
          <div className="alert-body">
            <span className="alert-title">Examen entregado</span>
            Tus respuestas quedaron registradas.
          </div>
        </div>
      ) : (
        <div className="alert alert-neutral" role="status">
          <Info className="icon" aria-hidden />
          <div className="alert-body">Ya entregaste este examen. No se puede editar ni volver a enviar.</div>
        </div>
      )}
      <section className="card">
        <h2 className="section-title" style={{ marginBottom: "0.75rem" }}>
          Instrucciones
        </h2>
        <p className="pre-wrap" style={{ margin: 0 }}>
          {examen.enunciado}
        </p>
      </section>
      <EntregaDetalle
        consignas={examen.consignas.map((c) => {
          const r = respuestaPorConsigna.get(c.id);
          return {
            ...c,
            respuesta: r?.texto ?? "",
            opcionSeleccionada: r?.opcionSeleccionada ?? null,
            diagrama: r?.diagrama ?? null,
          };
        })}
        habilitarEscritura={examen.habilitarEscritura}
        habilitarGeoGebra={examen.habilitarGeoGebra}
        geogebraState={entrega.geogebraState}
      />
    </div>
  );
}
