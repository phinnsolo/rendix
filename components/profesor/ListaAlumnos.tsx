"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CircleCheck, CircleDashed, Clock, Hourglass, Search, Users, type LucideIcon } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { UserAvatar } from "@/components/ui/Misc";
import { formatNumero } from "@/lib/format";
import type { AlumnoResumen, EstadoAlumno } from "@/lib/services/panel";

const ESTADO: Record<EstadoAlumno, { label: string; clase: string; Icon: LucideIcon }> = {
  CORRECCION_PENDIENTE: { label: "Corrección pendiente", clase: "status-pending", Icon: Hourglass },
  EXAMEN_PENDIENTE: { label: "Examen pendiente", clase: "status-active", Icon: Clock },
  AL_DIA: { label: "Al día", clase: "status-done", Icon: CircleCheck },
  SIN_ACTIVIDAD: { label: "Sin actividad", clase: "status-draft", Icon: CircleDashed },
};

const FILTROS = [
  { id: "todos", label: "Todos", test: () => true },
  { id: "activos", label: "Activos", test: (a: AlumnoResumen) => a.asignados > 0 },
  { id: "sinClase", label: "Sin clase", test: (a: AlumnoResumen) => !a.clase && !a.otraCatedra },
  { id: "examen", label: "Con examen pendiente", test: (a: AlumnoResumen) => a.pendientesRendir > 0 },
  { id: "correccion", label: "Con corrección pendiente", test: (a: AlumnoResumen) => a.pendientesCorreccion > 0 },
] as const;

export default function ListaAlumnos({ alumnos }: { alumnos: AlumnoResumen[] }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todos");
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro)!;
    const q = busqueda.trim().toLowerCase();
    return alumnos.filter((a) => f.test(a) && (!q || `${a.nombre} ${a.email}`.toLowerCase().includes(q)));
  }, [alumnos, filtro, busqueda]);

  if (alumnos.length === 0) {
    return (
      <EmptyState
        icon={Users}
        titulo="No hay alumnos para mostrar"
      />
    );
  }

  return (
    <>
      <div className="list-toolbar">
        <div className="segmented" role="group" aria-label="Filtrar alumnos">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" className="segmented-item" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.label}
              <span className="count">{alumnos.filter(f.test).length}</span>
            </button>
          ))}
        </div>
        <div className="input-group">
          <Search className="icon" aria-hidden />
          <input
            type="search"
            className="input input-sm"
            placeholder="Buscar por nombre o email..."
            aria-label="Buscar alumnos"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {visibles.length === 0 ? (
        <EmptyState compacto icon={Search} titulo="Sin resultados" descripcion="No hay alumnos que coincidan con la búsqueda o el filtro." />
      ) : (
        <ul className="row-list">
          <li className="row-list-head" aria-hidden>
            <span className="grow">Alumno</span>
            <span className="col-clase">Clase</span>
            <span className="col-num">Realizados</span>
            <span className="col-num">Promedio</span>
            <span className="col-status">Estado</span>
          </li>
          {visibles.map((a) => {
            const est = ESTADO[a.estado];
            return (
              <li key={a.id}>
                <div className="row-item">
                  <UserAvatar nombre={a.nombre} />
                  <div className="row-main">
                    <span className="row-title">{a.nombre}</span>
                    <div className="meta">
                      <span>{a.email}</span>
                    </div>
                  </div>
                  <div className="col-clase small">
                    {a.clase ? (
                      <Link href={`/profesor/clases/${a.clase.id}`} className="text-link">
                        {a.clase.nombre}
                      </Link>
                    ) : a.otraCatedra ? (
                      <span className="subtle italic">Otra cátedra</span>
                    ) : (
                      <span className="badge badge-dashed">Sin clase</span>
                    )}
                  </div>
                  <div className="row-stat col-num">
                    <strong>
                      {a.realizados}
                      <small className="muted">/{a.asignados}</small>
                    </strong>
                    <span>exámenes</span>
                  </div>
                  <div className="row-stat col-num">
                    <strong>{a.promedio !== null ? formatNumero(a.promedio) : "—"}</strong>
                    <span>sobre 10</span>
                  </div>
                  <div className="col-status">
                    <span className={`status ${est.clase}`}>
                      <est.Icon className="icon" aria-hidden />
                      {est.label}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="xsmall subtle" style={{ marginTop: "0.75rem" }}>
        El promedio considera solo entregas con corrección finalizada, normalizadas a escala 0–10.
      </p>
    </>
  );
}
