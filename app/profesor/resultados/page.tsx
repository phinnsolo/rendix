import Link from "next/link";
import { ChartColumn, CircleCheck, CircleX, ClipboardCheck, TrendingDown, TrendingUp } from "lucide-react";
import SelectorExamen from "@/components/profesor/SelectorExamen";
import { TIPO_INFO } from "@/components/TipoPregunta";
import EmptyState from "@/components/ui/EmptyState";
import { PageHeader, UserAvatar } from "@/components/ui/Misc";
import { UMBRAL_APROBACION } from "@/lib/estados";
import { formatNumero, plural } from "@/lib/format";
import { cargarOFallar } from "@/lib/page-load";
import { requireRole } from "@/lib/session";
import { resultadosExamen, resumenExamenes } from "@/lib/services/panel";

export default async function ResultadosPage({ searchParams }: { searchParams: Promise<{ examen?: string }> }) {
  const user = await requireRole("PROFESOR");
  const [{ examen: examenParam }, examenes] = await Promise.all([searchParams, resumenExamenes(user)]);
  const publicados = examenes.filter((e) => e.estado === "PUBLICADO");

  if (publicados.length === 0) {
    return (
      <>
        <PageHeader titulo="Resultados" subtitulo="Rendimiento de tus exámenes una vez corregidos." />
        <EmptyState
          icon={ChartColumn}
          titulo="Todavía no hay resultados"
          descripcion="Publicá un examen y corregí las entregas para ver promedios, aprobados y las preguntas más difíciles."
          accion={
            <Link href="/profesor/examenes" className="btn btn-secondary">
              Ir a exámenes
            </Link>
          }
        />
      </>
    );
  }

  // Por defecto: el examen publicado con más correcciones.
  const elegidoId =
    examenParam && publicados.some((e) => e.id === examenParam)
      ? examenParam
      : [...publicados].sort((a, b) => b.corregidas - a.corregidas)[0].id;
  const r = await cargarOFallar(() => resultadosExamen(user, elegidoId));
  const maxDist = Math.max(1, ...r.distribucion.map((d) => d.cantidad));
  const pctAprobados = r.corregidas ? Math.round((r.aprobados / r.corregidas) * 100) : 0;

  return (
    <>
      <PageHeader
        titulo="Resultados"
        subtitulo={`Aprobado: al menos ${Math.round(UMBRAL_APROBACION * 100)}% del puntaje. Se consideran las entregas con corrección finalizada.${r.escalaSobre10 ? " En exámenes por temas las notas se expresan sobre 10." : ""}`}
        acciones={<SelectorExamen opciones={publicados.map((e) => ({ id: e.id, titulo: e.titulo }))} valor={elegidoId} />}
      />

      {r.corregidas === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          titulo="Este examen todavía no tiene correcciones finalizadas"
          descripcion={`${plural(r.entregadas, "entrega recibida", "entregas recibidas")} de ${r.asignados} alumnos. Finalizá al menos una corrección para ver los resultados.`}
          accion={
            <Link href={`/profesor/examenes/${r.examen.id}#entregas`} className="btn">
              Ir a corregir
            </Link>
          }
        />
      ) : (
        <div className="stack-lg">
          <section className="kpi-row" aria-label="Indicadores">
            <div className="kpi kpi-hero">
              <span className="kpi-label">Nota promedio</span>
              <span className="kpi-value tabular">
                {formatNumero(r.promedio, 2)}
                <small> / {formatNumero(r.puntajeMaximo)}</small>
              </span>
              <span className="kpi-foot">{formatNumero(r.promedioSobre10)} sobre 10</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">
                <CircleCheck width={14} height={14} aria-hidden /> Aprobados
              </span>
              <span className="kpi-value tabular">{r.aprobados}</span>
              <span className="kpi-foot">{pctAprobados}% de los corregidos</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">
                <CircleX width={14} height={14} aria-hidden /> Desaprobados
              </span>
              <span className="kpi-value tabular">{r.desaprobados}</span>
              <span className="kpi-foot">{100 - pctAprobados}% de los corregidos</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">
                <ClipboardCheck width={14} height={14} aria-hidden /> Corregidas
              </span>
              <span className="kpi-value tabular">
                {r.corregidas}
                <small>/{r.entregadas}</small>
              </span>
              <span className="kpi-foot">
                {plural(r.asignados, "alumno", "alumnos")} en {r.examen.clase?.nombre ?? "la clase"}
              </span>
            </div>
          </section>

          {r.porTema.length > 0 && (
            <section aria-labelledby="temas-titulo">
              <div className="section-head">
                <h2 className="section-title" id="temas-titulo">
                  Por tema <span className="count">{r.porTema.length}</span>
                </h2>
              </div>
              <ul className="topic-stats">
                {r.porTema.map((t) => (
                  <li key={t.id}>
                    <div className="topic-stat">
                      <span className="topic-stat-name">{t.nombre}</span>
                      {t.titulo && <span className="topic-stat-title truncate">{t.titulo}</span>}
                      <span className="topic-stat-num tabular">{plural(t.alumnos, "alumno", "alumnos")}</span>
                      <span className="xsmall muted">
                        {t.promedioSobre10 !== null
                          ? `Promedio ${formatNumero(t.promedioSobre10)} / 10 · ${plural(t.corregidas, "corregida", "corregidas")}`
                          : "Sin correcciones finalizadas"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(r.peorPregunta || r.mejorPregunta) && (
            <section className="insight-row" aria-label="Preguntas destacadas">
              {r.peorPregunta && (
                <div className="insight is-low">
                  <span className="insight-icon">
                    <TrendingDown width={18} height={18} aria-hidden />
                  </span>
                  <div className="grow">
                    <span className="eyebrow">Pregunta con más errores</span>
                    <p className="insight-title">
                      {r.peorPregunta.tema ? `${r.peorPregunta.tema.nombre} · ` : ""}Pregunta {r.peorPregunta.orden} · {r.peorPregunta.rendimiento}% de
                      rendimiento
                    </p>
                    <p className="insight-text">{r.peorPregunta.texto}</p>
                  </div>
                </div>
              )}
              {r.mejorPregunta && (
                <div className="insight is-high">
                  <span className="insight-icon">
                    <TrendingUp width={18} height={18} aria-hidden />
                  </span>
                  <div className="grow">
                    <span className="eyebrow">Mejor rendimiento</span>
                    <p className="insight-title">
                      {r.mejorPregunta.tema ? `${r.mejorPregunta.tema.nombre} · ` : ""}Pregunta {r.mejorPregunta.orden} · {r.mejorPregunta.rendimiento}%
                      de rendimiento
                    </p>
                    <p className="insight-text">{r.mejorPregunta.texto}</p>
                  </div>
                </div>
              )}
            </section>
          )}

          <div className="results-grid">
            <section className="card" aria-labelledby="dist-titulo">
              <h2 className="section-title" id="dist-titulo">
                Distribución de notas
              </h2>
              <p className="small muted" style={{ margin: "0.35rem 0 1.25rem" }}>
                Cantidad de alumnos por rango de nota (escala 0–10).
              </p>
              <div className="histogram" role="img" aria-label={`Distribución: ${r.distribucion.map((d) => `${d.label}: ${d.cantidad}`).join(", ")}`}>
                {r.distribucion.map((d) => (
                  <div key={d.label} className="histogram-col" data-tooltip={`${plural(d.cantidad, "alumno", "alumnos")} entre ${d.label}`}>
                    <span className="histogram-track">
                      <span className="histogram-value tabular">{d.cantidad > 0 ? d.cantidad : ""}</span>
                      <span
                        className={`histogram-bar${d.label === "0–2" || d.label === "2–4" ? " is-low" : ""}`}
                        style={{ height: `${(d.cantidad / maxDist) * 100}%` }}
                      />
                    </span>
                    <span className="histogram-label">{d.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card" aria-labelledby="preg-titulo">
              <h2 className="section-title" id="preg-titulo">
                Rendimiento por pregunta
              </h2>
              <p className="small muted" style={{ margin: "0.35rem 0 1.25rem" }}>
                Puntaje promedio obtenido como porcentaje del máximo de cada pregunta.
              </p>
              <table className="perf-table">
                <thead className="sr-only">
                  <tr>
                    <th>Pregunta</th>
                    <th>Rendimiento</th>
                    <th>Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {r.porPregunta.map((p) => {
                    const { Icon, label } = TIPO_INFO[p.tipo];
                    return (
                      <tr key={p.id}>
                        <th scope="row">
                          <span className="perf-q">
                            <span className="tabular strong" title={p.tema ? p.tema.nombre : undefined}>
                              {p.etiqueta}
                            </span>
                            <Icon width={13} height={13} aria-label={label} className="subtle" />
                          </span>
                        </th>
                        <td className="perf-bar-cell">
                          {p.rendimiento === null ? (
                            <span className="xsmall subtle">Sin correcciones</span>
                          ) : (
                            <span className="perf-track" data-tooltip={`${p.texto.slice(0, 60)}${p.texto.length > 60 ? "…" : ""} — ${p.rendimiento}%`}>
                              <span className={`perf-bar${p.rendimiento < 40 ? " is-low" : ""}`} style={{ width: `${Math.max(p.rendimiento, 1)}%` }} />
                              <span className="perf-value tabular">{p.rendimiento}%</span>
                            </span>
                          )}
                        </td>
                        <td className="perf-avg tabular xsmall muted">
                          {p.promedio !== null ? `${formatNumero(p.promedio, 2)} / ${formatNumero(p.puntaje)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </div>

          <section aria-labelledby="alumnos-titulo">
            <div className="section-head">
              <h2 className="section-title" id="alumnos-titulo">
                Notas por alumno <span className="count">{r.alumnos.length}</span>
              </h2>
            </div>
            <ul className="row-list">
              {r.alumnos.map((a) => (
                <li key={a.entregaId}>
                  <div className="row-item">
                    <UserAvatar nombre={a.alumno.nombre} />
                    <div className="row-main">
                      <Link className="row-title row-link" href={`/profesor/examenes/${r.examen.id}/entregas/${a.entregaId}`}>
                        {a.alumno.nombre}
                      </Link>
                      <div className="meta">
                        <span>{a.alumno.email}</span>
                        {a.tema && (
                          <span>
                            {a.tema.nombre}
                            {a.tema.titulo && ` · ${a.tema.titulo}`}
                          </span>
                        )}
                      </div>
                    </div>
                    {a.aprobado === null ? (
                      <span className="status status-pending">Sin nota final</span>
                    ) : a.aprobado ? (
                      <span className="status status-done">
                        <CircleCheck className="icon" aria-hidden />
                        Aprobado
                      </span>
                    ) : (
                      <span className="status status-neutral">
                        <CircleX className="icon" aria-hidden />
                        Desaprobado
                      </span>
                    )}
                    <div className="row-stat">
                      <strong>{a.nota !== null ? formatNumero(a.nota) : "—"}</strong>
                      <span>de {formatNumero(r.puntajeMaximo)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
