import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleCheck,
  Clock,
  Layers,
  ListChecks,
  Play,
  School,
  UserRound,
} from "lucide-react";
import { AlumnoExamStatus, HerramientasBadges } from "@/components/EstadoBadge";
import EmptyState from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/Misc";
import { formatFechaCorta, plural, saludo } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { claseDelAlumno, listarExamenesAlumno, type ExamenAlumnoResumen } from "@/lib/services/alumno";

function accion(e: ExamenAlumnoResumen) {
  if (e.enCurso) return { texto: "Continuar", Icon: Play };
  if (!e.disponible) return { texto: "Ver detalles", Icon: ArrowRight };
  if (e.modo === "POR_TEMAS" && !e.tema) return { texto: "Elegir tema", Icon: Layers };
  return { texto: "Comenzar", Icon: Play };
}

export default async function AlumnoDashboard() {
  const user = await requireRole("ALUMNO");
  // La clase se identifica automáticamente a partir del alumno autenticado.
  const [clase, examenes] = await Promise.all([claseDelAlumno(user.id), listarExamenesAlumno(user)]);
  const pendientes = examenes.filter((e) => !e.entregado);
  const entregados = examenes.filter((e) => e.entregado);

  return (
    <>
      <PageHeader
        eyebrow={clase ? `${clase.nombre} · ${clase.profesor.nombre}` : undefined}
        titulo={`${saludo()}, ${user.nombre.split(" ")[0]}`}
        subtitulo={
          pendientes.length > 0
            ? `Tenés ${plural(pendientes.length, "examen pendiente", "exámenes pendientes")} para rendir.`
            : "No tenés exámenes pendientes."
        }
      />

      {examenes.length === 0 ? (
        <EmptyState
          icon={clase ? BookOpen : School}
          titulo={clase ? "No hay exámenes publicados" : "Todavía no estás en ninguna clase"}
        />
      ) : (
        <div className="stack-lg">
          <section aria-labelledby="pendientes-titulo">
            <div className="section-head">
              <h2 className="section-title" id="pendientes-titulo">
                Mis exámenes <span className="count">{pendientes.length}</span>
              </h2>
            </div>
            {pendientes.length === 0 ? (
              <EmptyState compacto icon={CircleCheck} titulo="No tenés exámenes pendientes" />
            ) : (
              <div className="exam-tiles">
                {pendientes.map((e) => {
                  const { texto, Icon } = accion(e);
                  return (
                    <article key={e.id} className="exam-tile" data-testid="examen-alumno">
                      <div className="row-between">
                        {e.enCurso ? (
                          <span className="status status-progress">
                            <Clock className="icon" aria-hidden />
                            En curso
                          </span>
                        ) : (
                          <AlumnoExamStatus entregado={false} />
                        )}
                        <span className="xsmall muted">{e.clase?.nombre}</span>
                      </div>
                      <h3 className="exam-tile-title">{e.titulo}</h3>
                      <div className="meta">
                        <span className="meta-item">
                          <UserRound className="icon" aria-hidden />
                          {e.profesor.nombre}
                        </span>
                        <span className="meta-item">
                          <CalendarDays className="icon" aria-hidden />
                          {e.fechaDisponible ? formatFechaCorta(e.fechaDisponible) : `Publicado ${formatFechaCorta(e.fechaPublicacion, false)}`}
                        </span>
                        {e.duracionMinutos && (
                          <span className="meta-item">
                            <Clock className="icon" aria-hidden />
                            {e.duracionMinutos} minutos
                          </span>
                        )}
                        {e.modo === "POR_TEMAS" ? (
                          <span className="meta-item">
                            <Layers className="icon" aria-hidden />
                            {e.tema ? `${e.tema.nombre}${e.tema.titulo ? ` · ${e.tema.titulo}` : ""}` : `Elegís 1 de ${e._count.temas} temas`}
                          </span>
                        ) : (
                          <span className="meta-item">
                            <ListChecks className="icon" aria-hidden />
                            {plural(e._count.consignas, "pregunta", "preguntas")}
                          </span>
                        )}
                      </div>
                      <HerramientasBadges escritura={e.habilitarEscritura} calculadora={e.habilitarCalculadora} geogebra={e.habilitarGeoGebra} />
                      {!e.disponible && !e.enCurso && (
                        <p className="xsmall muted" style={{ margin: 0 }}>
                          Disponible desde el {formatFechaCorta(e.fechaDisponible)}
                        </p>
                      )}
                      <Link className={`btn btn-block${e.disponible || e.enCurso ? "" : " btn-secondary"}`} href={`/alumno/examenes/${e.id}`}>
                        <Icon className="icon" aria-hidden />
                        {texto}
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {entregados.length > 0 && (
            <section aria-labelledby="entregados-titulo">
              <div className="section-head">
                <h2 className="section-title" id="entregados-titulo">
                  Entregados <span className="count">{entregados.length}</span>
                </h2>
              </div>
              <ul className="row-list">
                {entregados.map((e) => (
                  <li key={e.id} data-testid="examen-alumno">
                    <div className="row-item">
                      <div className="row-main">
                        <Link href={`/alumno/examenes/${e.id}`} className="row-title row-link">
                          {e.titulo}
                        </Link>
                        <div className="meta">
                          <span className="meta-item">
                            <UserRound className="icon" aria-hidden />
                            {e.profesor.nombre}
                          </span>
                          {e.tema && (
                            <span className="meta-item">
                              <Layers className="icon" aria-hidden />
                              {e.tema.nombre}
                              {e.tema.titulo && ` · ${e.tema.titulo}`}
                            </span>
                          )}
                          <span className="meta-item">
                            <CalendarDays className="icon" aria-hidden />
                            Entregado {formatFechaCorta(e.fechaEntrega)}
                          </span>
                        </div>
                      </div>
                      <AlumnoExamStatus entregado />
                      <div className="row-actions">
                        <Link href={`/alumno/examenes/${e.id}`} className="btn btn-ghost btn-sm">
                          Ver entrega
                          <ArrowRight className="icon" aria-hidden />
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
