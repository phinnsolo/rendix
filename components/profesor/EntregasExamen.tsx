"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Search } from "lucide-react";
import { EntregaStatus } from "@/components/EstadoBadge";
import EmptyState from "@/components/ui/EmptyState";
import { UserAvatar } from "@/components/ui/Misc";
import { estadoEntregaUI, notaSobre10 } from "@/lib/estados";
import { formatFechaCorta, formatNumero, plural } from "@/lib/format";
import type { FilaEntrega } from "@/lib/services/profesor";

interface TemaInfo {
  id: string;
  nombre: string;
  titulo: string | null;
}

interface Props {
  examenId: string;
  filas: FilaEntrega[];
  /** Vacío en exámenes normales. */
  temas: TemaInfo[];
}

const FILTROS_ESTADO = [
  { id: "todos", label: "Todos los estados", test: () => true },
  { id: "pendientes", label: "Pendientes de corrección", test: (f: FilaEntrega) => f.estado === "ENTREGADO" || f.estado === "EN_CORRECCION" },
  { id: "entregados", label: "Entregados", test: (f: FilaEntrega) => f.entregado },
  { id: "corregidos", label: "Corregidos", test: (f: FilaEntrega) => f.estado === "CORREGIDO" },
  { id: "en-curso", label: "En curso", test: (f: FilaEntrega) => f.estado === "EN_CURSO" },
  { id: "no-entregados", label: "No entregados", test: (f: FilaEntrega) => !f.entregado },
] as const;

type FiltroEstado = (typeof FILTROS_ESTADO)[number]["id"];

// Primero los que requieren acción: pendientes, en corrección, corregidos, en curso, sin entregar.
const PRIORIDAD = { ENTREGADO: 0, EN_CORRECCION: 1, CORREGIDO: 2, EN_CURSO: 3 } as const;
const prioridad = (f: FilaEntrega) => (f.estado ? PRIORIDAD[f.estado] : 4);

const etiquetaTema = (t: { nombre: string; titulo: string | null }) => (t.titulo ? `${t.nombre} · ${t.titulo}` : t.nombre);

/** Entregas individuales de un examen asignado a una clase: resumen, filtros y estado por alumno. */
export default function EntregasExamen({ examenId, filas, temas }: Props) {
  const router = useRouter();
  const [tema, setTema] = useState("todos");
  const [estado, setEstado] = useState<FiltroEstado>("todos");
  const [busqueda, setBusqueda] = useState("");
  const porTemas = temas.length > 0;

  const enClase = filas.filter((f) => f.enClase);
  const entregados = filas.filter((f) => f.entregado);
  const corregidos = filas.filter((f) => f.estado === "CORREGIDO");
  const porCorregir = filas.filter((f) => f.estado === "ENTREGADO" || f.estado === "EN_CORRECCION");
  const enCurso = filas.filter((f) => f.estado === "EN_CURSO");
  const noEntregaron = enClase.filter((f) => !f.entregado);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtro = FILTROS_ESTADO.find((x) => x.id === estado)!;
    return filas
      .filter((f) => filtro.test(f))
      .filter((f) => tema === "todos" || (tema === "sin-tema" ? !f.tema : f.tema?.id === tema))
      .filter((f) => !q || `${f.alumno.nombre} ${f.alumno.email}`.toLowerCase().includes(q))
      .sort((a, b) => prioridad(a) - prioridad(b) || a.alumno.nombre.localeCompare(b.alumno.nombre, "es"));
  }, [filas, estado, tema, busqueda]);

  // Estadísticas por tema: cuántos lo eligieron y su promedio (sobre 10) si hay correcciones.
  const estadisticas = temas.map((t) => {
    const delTema = filas.filter((f) => f.tema?.id === t.id);
    const notas = delTema
      .filter((f) => f.estado === "CORREGIDO" && f.notaTotal !== null)
      .map((f) => notaSobre10(f.notaTotal!, f.puntajeMaximo));
    return {
      ...t,
      eligieron: delTema.length,
      entregaron: delTema.filter((f) => f.entregado).length,
      promedio: notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null,
    };
  });

  return (
    <div className="stack">
      <dl className="summary-strip" aria-label="Resumen de entregas">
        <div>
          <dt>Entregaron</dt>
          <dd className="tabular">
            {entregados.length}
            <small>/{enClase.length}</small>
          </dd>
        </div>
        <div>
          <dt>Corregidos</dt>
          <dd className="tabular">{corregidos.length}</dd>
        </div>
        <div>
          <dt>Pendientes de corrección</dt>
          <dd className="tabular">{porCorregir.length}</dd>
        </div>
        <div>
          <dt>No entregaron</dt>
          <dd className="tabular">
            {noEntregaron.length}
            {enCurso.length > 0 && <small> · {enCurso.length} en curso</small>}
          </dd>
        </div>
      </dl>

      {porTemas && (
        <section aria-labelledby="titulo-por-tema">
          <h3 className="eyebrow" id="titulo-por-tema" style={{ marginBottom: "0.5rem" }}>
            Por tema
          </h3>
          <ul className="topic-stats">
            {estadisticas.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`topic-stat${tema === t.id ? " is-active" : ""}`}
                  onClick={() => setTema(tema === t.id ? "todos" : t.id)}
                  aria-pressed={tema === t.id}
                >
                  <span className="topic-stat-name">{t.nombre}</span>
                  {t.titulo && <span className="topic-stat-title truncate">{t.titulo}</span>}
                  <span className="topic-stat-num tabular">{plural(t.eligieron, "alumno", "alumnos")}</span>
                  <span className="xsmall muted">
                    {t.entregaron} entregaron{t.promedio !== null && ` · promedio ${formatNumero(t.promedio)}/10`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {filas.length === 0 ? (
        <EmptyState
          compacto
          icon={Inbox}
          titulo="La clase no tiene alumnos"
          descripcion="Agregá alumnos a la clase: van a poder rendir el examen aunque ya esté publicado."
        />
      ) : (
        <>
          <div className="list-toolbar filter-row">
            {porTemas && (
              <select className="select select-sm" aria-label="Filtrar por tema" value={tema} onChange={(e) => setTema(e.target.value)}>
                <option value="todos">Todos los temas</option>
                {temas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {etiquetaTema(t)}
                  </option>
                ))}
                <option value="sin-tema">Sin tema elegido</option>
              </select>
            )}
            <select
              className="select select-sm"
              aria-label="Filtrar por estado"
              value={estado}
              onChange={(e) => setEstado(e.target.value as FiltroEstado)}
            >
              {FILTROS_ESTADO.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} ({filas.filter(f.test).length})
                </option>
              ))}
            </select>
            <div className="input-group">
              <Search className="icon" aria-hidden />
              <input
                type="search"
                className="input input-sm"
                placeholder="Buscar alumno..."
                aria-label="Buscar alumno"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          </div>

          {visibles.length === 0 ? (
            <EmptyState compacto icon={Search} titulo="Sin resultados" descripcion="Ningún alumno coincide con los filtros." />
          ) : (
            <ul className="row-list" data-testid="entregas">
              <li className="row-list-head" aria-hidden>
                <span className="grow">Alumno</span>
                {porTemas && <span className="col-tema">Tema</span>}
                <span className="col-estado">Estado</span>
                <span className="col-nota">Nota</span>
                <span className="col-accion" />
              </li>
              {visibles.map((f) => {
                const href = f.entregaId ? `/profesor/examenes/${examenId}/entregas/${f.entregaId}` : null;
                return (
                  <li key={f.alumno.id} data-testid="fila-entrega">
                    <div
                      className={`row-item${href ? " is-clickable" : ""}`}
                      onClick={href ? () => router.push(href) : undefined}
                    >
                      <UserAvatar nombre={f.alumno.nombre} />
                      <div className="row-main">
                        {href ? (
                          <Link className="row-title row-link" href={href} onClick={(e) => e.stopPropagation()}>
                            {f.alumno.nombre}
                          </Link>
                        ) : (
                          <span className="row-title">{f.alumno.nombre}</span>
                        )}
                        <div className="meta">
                          <span>{f.alumno.email}</span>
                          {f.entregado && <span>Entregó {formatFechaCorta(f.fechaEntrega)}</span>}
                          {f.estado === "EN_CURSO" && f.fechaInicio && <span>Comenzó {formatFechaCorta(f.fechaInicio)}</span>}
                          {!f.enClase && <span className="subtle italic">Ya no está en la clase</span>}
                        </div>
                      </div>
                      {porTemas && (
                        <span className="col-tema small">
                          {f.tema ? (
                            <>
                              <strong>{f.tema.nombre}</strong>
                              {f.tema.titulo && <span className="muted truncate"> · {f.tema.titulo}</span>}
                            </>
                          ) : (
                            <span className="subtle">—</span>
                          )}
                        </span>
                      )}
                      <span className="col-estado">
                        <EntregaStatus estado={estadoEntregaUI(f.estado)} />
                      </span>
                      <div className="row-stat col-nota">
                        <strong>{f.notaTotal !== null ? formatNumero(f.notaTotal) : "—"}</strong>
                        {f.puntajeMaximo > 0 && <span>de {formatNumero(f.puntajeMaximo)}</span>}
                      </div>
                      <div className="row-actions col-accion">
                        {href && (
                          <Link
                            className={`btn btn-sm ${f.estado === "CORREGIDO" ? "btn-secondary" : ""}`}
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {f.estado === "CORREGIDO" ? "Ver entrega" : "Corregir"}
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
