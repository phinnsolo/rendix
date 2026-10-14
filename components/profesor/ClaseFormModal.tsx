"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { School } from "lucide-react";
import { Field } from "@/components/ui/Misc";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { claseSchema } from "@/lib/validations/clase";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  /** Si viene, el modal edita esa clase; si no, crea una nueva. */
  clase?: { id: string; nombre: string; descripcion: string | null };
}

/** Crear / editar una clase (nombre + descripción opcional). */
export default function ClaseFormModal({ abierto, onCerrar, clase }: Props) {
  const router = useRouter();
  const toast = useToast();
  const nombreRef = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState(clase?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(clase?.descripcion ?? "");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = claseSchema.safeParse({ nombre, descripcion });
    if (!parsed.success) {
      setErrores(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrores({});
    setGuardando(true);
    try {
      const res = await fetch(clase ? `/api/profesor/clases/${clase.id}` : "/api/profesor/clases", {
        method: clase ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar la clase");
        return;
      }
      if (clase) {
        toast.exito("Clase actualizada");
        onCerrar();
        router.refresh();
      } else {
        // Recién creada: lo siguiente es agregarle alumnos.
        router.push(`/profesor/clases/${data.clase.id}?creada=1`);
      }
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo={clase ? "Editar clase" : "Crear clase"}
      descripcion={clase ? undefined : "Después de crearla vas a poder agregar a sus alumnos."}
      icono={School}
      cerrable={!guardando}
      onCerrar={onCerrar}
      focoInicial={nombreRef}
    >
      <form className="stack" onSubmit={onSubmit} noValidate>
        <Field id="clase-nombre" label="Nombre de la clase" requerido error={errores.nombre}>
          <input
            ref={nombreRef}
            id="clase-nombre"
            className="input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={100}
            placeholder="Ej.: Matemática 1A"
            aria-invalid={Boolean(errores.nombre)}
          />
        </Field>
        <Field id="clase-descripcion" label="Descripción" opcional error={errores.descripcion}>
          <input
            id="clase-descripcion"
            className="input"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={1000}
            placeholder="Ej.: Comisión lunes y miércoles"
          />
        </Field>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions" style={{ padding: 0, border: 0 }}>
          <button type="button" className="btn btn-secondary" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={guardando}>
            {guardando && <span className="spinner" aria-hidden />}
            {guardando ? "Guardando..." : clase ? "Guardar cambios" : "Crear clase"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
