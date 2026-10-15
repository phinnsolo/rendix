"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileText, Plus, Search, SearchX } from "lucide-react";
import ExamCard from "@/components/profesor/ExamCard";
import EmptyState from "@/components/ui/EmptyState";
import type { ResumenExamen } from "@/lib/services/panel";

const FILTROS = [
  { id: "todos", label: "Todos", test: () => true },
  { id: "activos", label: "Activos", test: (e: ResumenExamen) => e.estadoUI === "ACTIVO" || e.estadoUI === "PENDIENTE_CORRECCION" },
  { id: "pendientes", label: "Pendientes de corrección", test: (e: ResumenExamen) => e.estadoUI === "PENDIENTE_CORRECCION" },
  { id: "borradores", label: "Borradores", test: (e: ResumenExamen) => e.estadoUI === "BORRADOR" },
  { id: "finalizados", label: "Finalizados", test: (e: ResumenExamen) => e.estadoUI === "FINALIZADO" },
] as const;

type FiltroId = (typeof FILTROS)[number]["id"];

export default function ExamList({ examenes, filtroInicial }: { examenes: ResumenExamen[]; filtroInicial?: string }) {
  const [filtro, setFiltro] = useState<FiltroId>(
    FILTROS.some((f) => f.id === filtroInicial) ? (filtroInicial as FiltroId) : "todos",
  );
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const f = FILTROS.find((x) => x.id === filtro)!;
    return examenes.filter((e) => f.test(e) && (!q || e.titulo.toLowerCase().includes(q)));
  }, [examenes, filtro, busqueda]);

  if (examenes.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        titulo="Todavía no creaste ningún examen"
        descripcion="Se guarda como borrador hasta que lo publiques."
        accion={
          <Link href="/profesor/examenes/nuevo" className="btn">
            <Plus className="icon" aria-hidden />
            Crear examen
          </Link>
        }
      />
    );
  }

  return (
    <>
      <div className="list-toolbar">
        <div className="segmented" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="segmented-item"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
            >
              {f.label}
              <span className="count">{examenes.filter(f.test).length}</span>
            </button>
          ))}
        </div>
        <div className="input-group">
          <Search className="icon" aria-hidden />
          <input
            type="search"
            className="input input-sm"
            placeholder="Buscar por título..."
            aria-label="Buscar exámenes"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {visibles.length === 0 ? (
        <EmptyState
          compacto
          icon={SearchX}
          titulo="No hay exámenes que coincidan"
          descripcion="Probá con otro filtro o con otra búsqueda."
          accion={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setFiltro("todos");
                setBusqueda("");
              }}
            >
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <ul className="row-list">
          {visibles.map((e) => (
            <li key={e.id}>
              <ExamCard examen={e} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
