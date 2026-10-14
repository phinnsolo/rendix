"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCheck, Inbox, Search } from "lucide-react";
import { EstadoCorreccionBadge } from "@/components/EstadoBadge";
import EmptyState from "@/components/ui/EmptyState";
import { UserAvatar } from "@/components/ui/Misc";
import { formatFechaCorta, formatNumero } from "@/lib/format";
import type { EntregaBandeja } from "@/lib/services/panel";

const FILTROS = [
  { id: "pendientes", label: "Por corregir", test: (e: EntregaBandeja) => e.estado !== "CORREGIDO" },
  { id: "corregidas", label: "Corregidas", test: (e: EntregaBandeja) => e.estado === "CORREGIDO" },
  { id: "todas", label: "Todas", test: () => true },
] as const;

export default function BandejaCorrecciones({ entregas }: { entregas: EntregaBandeja[] }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("pendientes");
  const [busqueda, setBusqueda] = useState("");

  // Agrupadas por examen, conservando el orden (más antiguas primero).
  const grupos = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro)!;
    const q = busqueda.trim().toLowerCase();
    const mapa = new Map<string, { titulo: string; id: string; items: EntregaBandeja[] }>();
    for (const e of entregas) {
      if (!f.test(e)) continue;
      if (q && !`${e.alumno.nombre} ${e.alumno.email} ${e.examen.titulo}`.toLowerCase().includes(q)) continue;
      const g = mapa.get(e.examen.id) ?? { titulo: e.examen.titulo, id: e.examen.id, items: [] };
      g.items.push(e);
      mapa.set(e.examen.id, g);
    }
    return [...mapa.values()];
  }, [entregas, filtro, busqueda]);

  if (entregas.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        titulo="Todavía no hay entregas"
        descripcion="Cuando tus alumnos entreguen un examen publicado, vas a poder corregirlo desde acá."
      />
    );
  }

  return (
    <>
      <div className="list-toolbar">
        <div className="segmented" role="group" aria-label="Filtrar entregas">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" className="segmented-item" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.label}
              <span className="count">{entregas.filter(f.test).length}</span>
            </button>
          ))}
        </div>
        <div className="input-group">
          <Search className="icon" aria-hidden />
          <input
            type="search"
            className="input input-sm"
            placeholder="Buscar alumno o examen..."
            aria-label="Buscar entregas"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {grupos.length === 0 ? (
        filtro === "pendientes" && !busqueda ? (
          <EmptyState icon={CheckCheck} titulo="Estás al día" descripcion="No hay entregas esperando corrección." />
        ) : (
          <EmptyState compacto icon={Search} titulo="Sin resultados" descripcion="No hay entregas que coincidan con el filtro." />
        )
      ) : (
        <div className="stack-lg">
          {grupos.map((g) => (
            <section key={g.id} aria-labelledby={`g-${g.id}`}>
              <div className="section-head">
                <h2 className="section-title" id={`g-${g.id}`}>
                  {g.titulo} <span className="count">{g.items.length}</span>
                </h2>
                <Link href={`/profesor/examenes/${g.id}#entregas`} className="btn btn-ghost btn-sm">
                  Ver examen
                  <ArrowRight className="icon" aria-hidden />
                </Link>
              </div>
              <ul className="row-list">
                {g.items.map((e) => {
                  const href = `/profesor/examenes/${e.examen.id}/entregas/${e.id}`;
                  return (
                    <li key={e.id}>
                      <div className="row-item">
                        <UserAvatar nombre={e.alumno.nombre} />
                        <div className="row-main">
                          <Link href={href} className="row-title row-link">
                            {e.alumno.nombre}
                          </Link>
                          <div className="meta">
                            <span>{e.alumno.email}</span>
                            {e.tema && (
                              <span>
                                {e.tema.nombre}
                                {e.tema.titulo && ` · ${e.tema.titulo}`}
                              </span>
                            )}
                            <span>Entregó {formatFechaCorta(e.fechaEntrega)}</span>
                          </div>
                        </div>
                        <EstadoCorreccionBadge estado={e.estado} />
                        <div className="row-stat">
                          <strong>{e.notaTotal !== null ? formatNumero(e.notaTotal) : "—"}</strong>
                          <span>de {formatNumero(e.examen.puntajeMaximo)}</span>
                        </div>
                        <div className="row-actions">
                          <Link href={href} className={`btn btn-sm ${e.estado === "CORREGIDO" ? "btn-secondary" : ""}`}>
                            {e.estado === "CORREGIDO" ? "Revisar" : "Corregir"}
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
