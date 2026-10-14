"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import { useToast } from "@/components/ui/Toast";

interface Props {
  examenId: string;
  /** Clase asignada (sin clase no se puede publicar). */
  clase: { nombre: string; alumnos: number } | null;
}

export default function PublicarButton({ examenId, clase }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publicar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/profesor/examenes/${examenId}/publicar`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detalles = Array.isArray(data.detalles)
          ? ` (${(data.detalles as { mensaje: string }[]).map((d) => d.mensaje).join("; ")})`
          : "";
        setError((data.error ?? "No se pudo publicar el examen") + detalles);
        toast.error("No se pudo publicar el examen");
        setAbierto(false);
        return;
      }
      setAbierto(false);
      router.replace(`/profesor/examenes/${examenId}?publicado=1`);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Intentá nuevamente.");
      setAbierto(false);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <button
        className="btn"
        onClick={() => setAbierto(true)}
        disabled={!clase}
        title={clase ? undefined : "Asigná el examen a una clase para poder publicarlo"}
      >
        <Send className="icon" aria-hidden />
        Publicar examen
      </button>
      {error && (
        <div className="alert alert-error" role="alert" style={{ width: "100%" }}>
          {error}
        </div>
      )}
      <ConfirmModal
        abierto={abierto}
        titulo="¿Publicar examen?"
        icono={Send}
        mensaje={
          clase && clase.alumnos === 0
            ? `La clase ${clase.nombre} todavía no tiene alumnos: lo verán los que agregues después. Una vez publicado no podrás editar sus preguntas.`
            : `Todos los alumnos de ${clase?.nombre ?? "la clase"} (también los que se agreguen después) podrán verlo y rendirlo. Una vez publicado no podrás editar sus preguntas.`
        }
        textoConfirmar="Publicar"
        textoCargando="Publicando..."
        cargando={cargando}
        onConfirmar={publicar}
        onCancelar={() => setAbierto(false)}
      />
    </>
  );
}
