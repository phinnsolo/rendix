import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { ExamStatus } from "@/components/EstadoBadge";
import EmptyState from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/Misc";
import { FileText } from "lucide-react";
import { formatFechaCorta, formatRelativo, plural, saludo } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { bandejaCorrecciones, contarAlumnosEvaluados, resumenExamenes } from "@/lib/services/panel";

export default async function ProfesorDashboard() {
  const user = await requireRole("PROFESOR");
  const [examenes, bandeja, evaluados] = await Promise.all([
    resumenExamenes(user),
    bandejaCorrecciones(user),
    contarAlumnosEvaluados(user),
  ]);

  const activos = examenes.filter((e) => e.estado === "PUBLICADO" && e.estadoUI !== "FINALIZADO");
  const borradores = examenes.filter((e) => e.estado === "BORRADOR");
  const conPendientes = examenes.filter((e) => e.pendientes > 0).sort((a, b) => b.pendientes - a.pendientes);
  const pendientes = bandeja.filter((e) => e.estado !== "CORREGIDO");
  const recientes = [...bandeja].sort((a, b) => +b.fechaEntrega - +a.fechaEntrega).slice(0, 5);
  const primerNombre = user.nombre.split(" ")[0];
  const primeraPendiente = pendientes[0];

  return (
    <div className="front-page">
      <header className="front-head">
        <div>
          <h1 className="front-title">
            {saludo()},<br />
            <em>{primerNombre}.</em>
          </h1>
        </div>
        <div className="front-head-side">
          <p className="front-lead">
            {examenes.length === 0 ? (
              "Todavía no creaste exámenes."
            ) : (
              <>
                Tenés <strong>{plural(activos.length, "examen activo", "exámenes activos")}</strong> y{" "}
                <strong>{plural(pendientes.length, "entrega pendiente", "entregas pendientes")}</strong> de corrección.
              </>
            )}
          </p>
          <Link href="/profesor/examenes/nuevo" className="btn btn-lg">
            <Plus className="icon" aria-hidden />
            Crear examen
          </Link>
        </div>
      </header>

      {examenes.length === 0 ? (
        <EmptyState
          icon={FileText}
          titulo="Todavía no creaste ningún examen."
          descripcion="Se guarda como borrador hasta que lo publiques."
          accion={
            <Link href="/profesor/examenes/nuevo" className="btn">
              <Plus className="icon" aria-hidden />
              Crear examen
            </Link>
          }
        />
      ) : (
        <>
          <div className="front-grid">
            {/* Nota principal: lo que requiere acción */}
            <section className="front-story" aria-labelledby="pendientes-titulo">
              <h2 className="section-title" id="pendientes-titulo">
                Pendientes de corrección
              </h2>
              {pendientes.length > 0 ? (
                <div className="front-story-body">
                  <div className="big-numeral tabular" aria-hidden>
                    {pendientes.length}
                  </div>
                  <div className="front-story-text">
                    <p className="front-story-kicker">
                      {plural(pendientes.length, "entrega espera", "entregas esperan")} tu corrección en{" "}
                      {plural(conPendientes.length, "examen", "exámenes")}.
                    </p>
                    <ul className="leader-list">
                      {conPendientes.slice(0, 4).map((e) => (
                        <li key={e.id}>
                          <Link href={`/profesor/examenes/${e.id}#entregas`} className="leader">
                            <span className="truncate">{e.titulo}</span>
                            <span className="leader-dots" aria-hidden />
                            <span className="leader-value tabular">{e.pendientes}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <div className="row" style={{ gap: "1rem" }}>
                      <Link
                        href={
                          primeraPendiente
                            ? `/profesor/examenes/${primeraPendiente.examen.id}/entregas/${primeraPendiente.id}`
                            : "/profesor/correcciones"
                        }
                        className="btn"
                      >
                        Corregir ahora
                        <ArrowRight className="icon" aria-hidden />
                      </Link>
                      <Link href="/profesor/correcciones" className="text-link">
                        Ver la bandeja completa
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="front-story-body">
                  <div className="big-numeral is-zero" aria-hidden>
                    0
                  </div>
                  <p className="front-story-kicker">
                    No hay entregas pendientes.
                  </p>
                </div>
              )}
            </section>

            <aside className="front-figures" aria-labelledby="cifras-titulo">
              <h2 className="section-title" id="cifras-titulo">
                Resumen
              </h2>
              <dl className="figures">
                <div>
                  <dt>
                    <Link href="/profesor/examenes?estado=activos">Exámenes activos</Link>
                  </dt>
                  <span className="leader-dots" aria-hidden />
                  <dd className="tabular">{activos.length}</dd>
                </div>
                <div>
                  <dt>
                    <Link href="/profesor/examenes?estado=borradores">Borradores</Link>
                  </dt>
                  <span className="leader-dots" aria-hidden />
                  <dd className="tabular">{borradores.length}</dd>
                </div>
                <div>
                  <dt>Entregas recibidas</dt>
                  <span className="leader-dots" aria-hidden />
                  <dd className="tabular">{bandeja.length}</dd>
                </div>
                <div>
                  <dt>
                    <Link href="/profesor/alumnos">Alumnos evaluados</Link>
                  </dt>
                  <span className="leader-dots" aria-hidden />
                  <dd className="tabular">{evaluados}</dd>
                </div>
              </dl>
            </aside>
          </div>

          <section className="front-section" aria-labelledby="en-curso">
            <div className="section-head">
              <h2 className="section-title" id="en-curso">
                Exámenes en curso <span className="count">{activos.length}</span>
              </h2>
              <Link href="/profesor/examenes" className="text-link mono-link">
                Todos los exámenes →
              </Link>
            </div>
            {activos.length === 0 ? (
              <p className="muted">No hay exámenes en curso.</p>
            ) : (
              <ol className="toc">
                {activos.map((e, i) => (
                  <li key={e.id}>
                    <Link href={`/profesor/examenes/${e.id}`} className="toc-row">
                      <span className="toc-row-num">{i + 1}</span>
                      <span className="toc-row-main">
                        <span className="toc-row-title">{e.titulo}</span>
                        <span className="meta">
                          Publicado {formatFechaCorta(e.fechaPublicacion, false)} · {plural(e.preguntas, "pregunta", "preguntas")}
                        </span>
                      </span>
                      <span className="toc-row-progress">
                        <span className="toc-row-fraction tabular">
                          {e.entregas}
                          <small>/{e.asignados} entregas</small>
                        </span>
                        <ProgressBar valor={e.entregas} maximo={Math.max(e.asignados, 1)} etiqueta={`Entregas de ${e.titulo}`} tamanio="sm" />
                      </span>
                      <ExamStatus estado={e.estadoUI} />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="front-columns">
            <section aria-labelledby="borradores">
              <h2 className="section-title" id="borradores">
                Borradores <span className="count">{borradores.length}</span>
              </h2>
              {borradores.length === 0 ? (
                <p className="muted">No hay borradores.</p>
              ) : (
                <ul className="brief-list">
                  {borradores.slice(0, 4).map((e) => (
                    <li key={e.id}>
                      <Link href={`/profesor/examenes/${e.id}/editar`}>
                        <span className="brief-title">{e.titulo}</span>
                        <span className="meta">Editado {formatRelativo(e.actualizado)} · continuar →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="actividad">
              <h2 className="section-title" id="actividad">
                Últimas entregas
              </h2>
              {recientes.length === 0 ? (
                <p className="muted">Todavía no hay entregas.</p>
              ) : (
                <ul className="brief-list">
                  {recientes.map((e) => (
                    <li key={e.id}>
                      <Link href={`/profesor/examenes/${e.examen.id}/entregas/${e.id}`}>
                        <span className="brief-title">
                          {e.alumno.nombre}
                          <span className="brief-note">
                            {e.estado === "CORREGIDO" ? `${e.notaTotal ?? "—"}/${e.examen.puntajeMaximo}` : "por corregir"}
                          </span>
                        </span>
                        <span className="meta">
                          {e.examen.titulo} · {formatRelativo(e.fechaEntrega)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
