"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ListChecks, Search } from "lucide-react";
import QuestionCard from "@/components/profesor/QuestionCard";
import { ORDEN_TIPOS, TIPO_INFO } from "@/components/TipoPregunta";
import EmptyState from "@/components/ui/EmptyState";
import type { TipoConsigna } from "@/lib/correccion";
import type { PreguntaBanco } from "@/lib/services/panel";

function Rendimiento({ valor, corregidas }: { valor: number | null; corregidas: number }) {
  if (valor === null) return <span className="xsmall subtle">Sin correcciones</span>;
  const tono = valor >= 70 ? "badge-success" : valor >= 40 ? "badge-warning" : "badge-danger";
  return (
    <span className={`badge ${tono} tabular`} title={`Promedio sobre ${corregidas} respuestas corregidas`}>
      {valor}% de rendimiento
    </span>
  );
}

export default function BancoPreguntas({ preguntas }: { preguntas: PreguntaBanco[] }) {
  const [tipo, setTipo] = useState<TipoConsigna | "TODOS">("TODOS");
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return preguntas.filter(
      (p) => (tipo === "TODOS" || p.tipo === tipo) && (!q || `${p.texto} ${p.examen.titulo}`.toLowerCase().includes(q)),
    );
  }, [preguntas, tipo, busqueda]);

  if (preguntas.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        titulo="Todavía no hay preguntas"
        descripcion="Las preguntas que agregues a tus exámenes van a aparecer acá."
        accion={
          <Link href="/profesor/examenes/nuevo" className="btn">
            Crear examen
          </Link>
        }
      />
    );
  }

  return (
    <>
      <div className="list-toolbar">
        <div className="segmented" role="group" aria-label="Filtrar por tipo">
          <button type="button" className="segmented-item" aria-pressed={tipo === "TODOS"} onClick={() => setTipo("TODOS")}>
            Todas <span className="count">{preguntas.length}</span>
          </button>
          {ORDEN_TIPOS.map((t) => {
            const { Icon, label } = TIPO_INFO[t];
            return (
              <button key={t} type="button" className="segmented-item" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
                <Icon width={14} height={14} aria-hidden />
                {label}
                <span className="count">{preguntas.filter((p) => p.tipo === t).length}</span>
              </button>
            );
          })}
        </div>
        <div className="input-group">
          <Search className="icon" aria-hidden />
          <input
            type="search"
            className="input input-sm"
            placeholder="Buscar en enunciados..."
            aria-label="Buscar preguntas"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {visibles.length === 0 ? (
        <EmptyState compacto icon={Search} titulo="Sin resultados" descripcion="No hay preguntas que coincidan con el filtro." />
      ) : (
        <div className="qcard-list">
          {visibles.map((p) => (
            <QuestionCard
              key={p.id}
              orden={p.orden}
              texto={p.texto}
              tipo={p.tipo}
              puntaje={p.puntaje}
              opciones={p.opciones}
              criterio={p.criterio}
              extra={
                <span className="row" style={{ gap: "0.6rem" }}>
                  <Rendimiento valor={p.rendimiento} corregidas={p.corregidas} />
                  <Link href={`/profesor/examenes/${p.examen.id}`} className="xsmall strong">
                    {p.examen.titulo}
                  </Link>
                  {p.tema && <span className="xsmall muted">{p.tema.nombre}</span>}
                </span>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
