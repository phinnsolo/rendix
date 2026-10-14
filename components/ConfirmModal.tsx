"use client";

import { useRef, type ReactNode } from "react";
import { AlertTriangle, CircleHelp, type LucideIcon } from "lucide-react";
import Modal from "@/components/ui/Modal";

interface Props {
  abierto: boolean;
  titulo: string;
  mensaje: ReactNode;
  textoConfirmar: string;
  textoCancelar?: string;
  /** "danger" para acciones destructivas o irreversibles. */
  tono?: "primary" | "danger";
  icono?: LucideIcon;
  cargando?: boolean;
  textoCargando?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Diálogo de confirmación (ConfirmDialog). El foco inicial queda en "Cancelar", la opción segura. */
export default function ConfirmModal({
  abierto,
  titulo,
  mensaje,
  textoConfirmar,
  textoCancelar = "Cancelar",
  tono = "primary",
  icono,
  cargando,
  textoCargando = "Procesando...",
  onConfirmar,
  onCancelar,
}: Props) {
  const cancelarRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      abierto={abierto}
      titulo={titulo}
      icono={icono ?? (tono === "danger" ? AlertTriangle : CircleHelp)}
      tono={tono}
      cerrable={!cargando}
      onCerrar={onCancelar}
      focoInicial={cancelarRef}
      acciones={
        <>
          <button ref={cancelarRef} type="button" className="btn btn-secondary" onClick={onCancelar} disabled={cargando}>
            {textoCancelar}
          </button>
          <button
            type="button"
            className={`btn ${tono === "danger" ? "btn-danger" : ""}`}
            onClick={onConfirmar}
            disabled={cargando}
          >
            {cargando && <span className="spinner" aria-hidden />}
            {cargando ? textoCargando : textoConfirmar}
          </button>
        </>
      }
    >
      {typeof mensaje === "string" ? <p>{mensaje}</p> : mensaje}
    </Modal>
  );
}

export { ConfirmModal as ConfirmDialog };
