"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, FileText, Plus, School, Users } from "lucide-react";
import ClaseFormModal from "@/components/profesor/ClaseFormModal";
import EmptyState from "@/components/ui/EmptyState";
import { plural } from "@/lib/format";
import type { ClaseResumen } from "@/lib/services/clases";

/** Botón "Crear clase" (abre el modal). Se usa en la cabecera y en el estado vacío. */
export function CrearClaseButton({ className = "btn" }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setAbierto(true)}>
        <Plus className="icon" aria-hidden />
        Crear clase
      </button>
      {abierto && <ClaseFormModal abierto onCerrar={() => setAbierto(false)} />}
    </>
  );
}

export default function ClasesLista({ clases }: { clases: ClaseResumen[] }) {
  if (clases.length === 0) {
    return (
      <EmptyState
        icon={School}
        titulo="Todavía no tenés clases"
        descripcion="Creá una clase y agregale alumnos."
        accion={<CrearClaseButton />}
      />
    );
  }

  return (
    <ul className="class-grid" data-testid="clases">
      {clases.map((c) => (
        <li key={c.id} className="class-card" data-testid="clase-card">
          <div className="stack-sm">
            <h2 className="class-card-title">
              <Link href={`/profesor/clases/${c.id}`} className="row-link">
                {c.nombre}
              </Link>
            </h2>
            {c.descripcion && <p className="small muted class-card-desc">{c.descripcion}</p>}
          </div>
          <dl className="class-card-figures">
            <div>
              <dt>
                <Users className="icon" aria-hidden /> Alumnos
              </dt>
              <dd className="tabular">{c.alumnos}</dd>
            </div>
            <div>
              <dt>
                <FileText className="icon" aria-hidden /> Exámenes activos
              </dt>
              <dd className="tabular">{c.examenesActivos}</dd>
            </div>
          </dl>
          <p className="xsmall subtle">
            {plural(c.alumnos, "alumno", "alumnos")} · {plural(c.examenesActivos, "examen activo", "exámenes activos")}
            {c.borradores > 0 && ` · ${plural(c.borradores, "borrador", "borradores")}`}
          </p>
          <Link href={`/profesor/clases/${c.id}`} className="btn btn-secondary btn-sm">
            Ver clase
            <ArrowRight className="icon" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
