"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, School } from "lucide-react";
import type { ClaseOpcion } from "@/components/profesor/ExamenForm";
import { useToast } from "@/components/ui/Toast";
import { plural } from "@/lib/format";

interface Props {
  examenId: string;
  clase: { id: string; nombre: string; alumnos: number } | null;
  clases: ClaseOpcion[];
  /** Si algún alumno ya eligió tema, comenzó o entregó, la clase queda fija. */
  bloqueada: boolean;
}

/** Clase asignada al examen. Se puede cambiar mientras ningún alumno lo haya comenzado. */
export default function ClaseExamenEditor({ examenId, clase, clases, bloqueada }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [seleccion, setSeleccion] = useState(clase?.id ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/profesor/examenes/${examenId}/clase`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claseId: seleccion }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo asignar la clase");
        return;
      }
      toast.exito("Clase asignada");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="stack-sm">
      {clase ? (
        <div className="row" style={{ gap: "0.75rem" }}>
          <span className="editor-pane-icon" aria-hidden>
            <School width={16} height={16} />
          </span>
          <span className="grow">
            <Link href={`/profesor/clases/${clase.id}`} className="strong row-link">
              {clase.nombre}
            </Link>
            <span className="xsmall muted" style={{ display: "block" }}>
              {plural(clase.alumnos, "alumno", "alumnos")} con acceso
            </span>
          </span>
        </div>
      ) : (
        <p className="small muted italic" style={{ margin: 0 }}>
          Sin clase asignada: nadie puede verlo.
        </p>
      )}

      {bloqueada ? (
        <p className="xsmall subtle row" style={{ gap: "0.35rem", margin: 0 }}>
          <Lock width={12} height={12} aria-hidden />
          Hay alumnos que ya comenzaron: la clase no se puede cambiar.
        </p>
      ) : clases.length === 0 ? (
        <Link href="/profesor/clases" className="btn btn-ghost btn-sm">
          Crear una clase
          <ArrowRight className="icon" aria-hidden />
        </Link>
      ) : (
        <div className="field">
          <label className="label" htmlFor="clase-examen">
            {clase ? "Cambiar clase" : "Asignar a"}
          </label>
          <select id="clase-examen" className="select" value={seleccion} onChange={(e) => setSeleccion(e.target.value)}>
            {!clase && <option value="">Elegí una clase</option>}
            {clases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({plural(c.alumnos, "alumno", "alumnos")})
              </option>
            ))}
          </select>
          {seleccion && seleccion !== clase?.id && (
            <div className="row" style={{ justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeleccion(clase?.id ?? "")} disabled={guardando}>
                Descartar
              </button>
              <button type="button" className="btn btn-sm" onClick={guardar} disabled={guardando}>
                {guardando && <span className="spinner" aria-hidden />}
                {guardando ? "Guardando..." : "Asignar clase"}
              </button>
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
