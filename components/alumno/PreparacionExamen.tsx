"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CircleAlert, Clock, Layers, ListChecks, Lock, Play, Repeat, School, UserRound } from "lucide-react";
import { HerramientasBadges } from "@/components/EstadoBadge";
import TemaCards, { type TemaCard } from "@/components/TemaCards";
import { PageHeader } from "@/components/ui/Misc";
import Modal from "@/components/ui/Modal";
import { formatFechaCorta, plural } from "@/lib/format";

export interface ExamenAPreparar {
  id: string;
  titulo: string;
  enunciado: string;
  profesor: string;
  clase: string | null;
  modo: "NORMAL" | "POR_TEMAS";
  fechaDisponible: string | Date | null;
  duracionMinutos: number | null;
  disponible: boolean;
  habilitarEscritura: boolean;
  habilitarCalculadora: boolean;
  habilitarGeoGebra: boolean;
  temas: TemaCard[];
  tema: { id: string; nombre: string; titulo: string | null; descripcion: string | null } | null;
  cantidadConsignas: number | null;
}

const nombreTema = (t: { nombre: string; titulo: string | null }) => (t.titulo ? `${t.nombre} - ${t.titulo}` : t.nombre);

/**
 * Antes de resolver: en un examen POR_TEMAS el alumno elige (y puede cambiar) un tema; después
 * ve las condiciones y comienza. Al comenzar, el tema queda bloqueado y empieza a correr el tiempo.
 */
export default function PreparacionExamen({ examen }: { examen: ExamenAPreparar }) {
  const router = useRouter();
  const porTemas = examen.modo === "POR_TEMAS";
  const [eligiendo, setEligiendo] = useState(porTemas && !examen.tema);
  const [aConfirmar, setAConfirmar] = useState<TemaCard | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pedir(url: string, init: RequestInit): Promise<boolean> {
    setProcesando(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo completar la operación");
        // El servidor manda: si el examen ya cambió de estado (comenzado / entregado), se recarga.
        if (res.status === 409) router.refresh();
        return false;
      }
      return true;
    } catch {
      setError("No se pudo conectar con el servidor. Intentá nuevamente.");
      return false;
    } finally {
      setProcesando(false);
    }
  }

  async function confirmarTema() {
    if (!aConfirmar) return;
    const ok = await pedir(`/api/alumno/examenes/${examen.id}/tema`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temaId: aConfirmar.id }),
    });
    setAConfirmar(null);
    if (ok) {
      setEligiendo(false);
      router.refresh();
    }
  }

  async function comenzar() {
    if (await pedir(`/api/alumno/examenes/${examen.id}/iniciar`, { method: "POST" })) router.refresh();
  }

  const avisoError = error && (
    <div className="alert alert-error" role="alert">
      <CircleAlert className="icon" aria-hidden />
      <div className="alert-body">{error}</div>
    </div>
  );

  if (eligiendo) {
    return (
      <div className="container-narrow stack-lg">
        <PageHeader
          volver={{ href: "/alumno", label: "Mis exámenes" }}
          eyebrow={examen.clase ?? "Examen por temas"}
          titulo="Elegí un tema"
          subtitulo={`${examen.titulo}. Respondés solo las preguntas del tema que elijas.`}
        />
        {avisoError}
        <TemaCards temas={examen.temas} seleccionado={examen.tema?.id} onElegir={setAConfirmar} deshabilitado={procesando} />
        {examen.tema && (
          <div>
            <button type="button" className="btn btn-ghost" onClick={() => setEligiendo(false)}>
              Mantener {nombreTema(examen.tema)}
            </button>
          </div>
        )}
        <Modal
          abierto={aConfirmar !== null}
          titulo="¿Querés continuar con este tema?"
          icono={Layers}
          cerrable={!procesando}
          onCerrar={() => setAConfirmar(null)}
          acciones={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setAConfirmar(null)} disabled={procesando}>
                Volver
              </button>
              <button type="button" className="btn" onClick={confirmarTema} disabled={procesando}>
                {procesando && <span className="spinner" aria-hidden />}
                {procesando ? "Guardando..." : "Confirmar tema"}
              </button>
            </>
          }
        >
          <p>
            Tema seleccionado: <strong className="text-strong">{aConfirmar && nombreTema(aConfirmar)}</strong>
          </p>
          <p className="small muted">
            Hasta que comiences podés cambiarlo. Una vez que comiences a responder no podrás cambiar de tema.
          </p>
        </Modal>
      </div>
    );
  }

  return (
    <div className="container-narrow stack-lg">
      <PageHeader volver={{ href: "/alumno", label: "Mis exámenes" }} eyebrow={examen.clase ?? undefined} titulo={examen.titulo} subtitulo={`Profesor/a: ${examen.profesor}`} />

      {porTemas && examen.tema && (
        <section className="card topic-selected" aria-labelledby="tema-elegido">
          <div className="row-between" style={{ alignItems: "flex-start" }}>
            <div>
              <span className="eyebrow">Tema seleccionado</span>
              <h2 className="topic-choice-title" id="tema-elegido">
                {nombreTema(examen.tema)}
              </h2>
              {examen.tema.descripcion && <p className="small muted pre-wrap">{examen.tema.descripcion}</p>}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEligiendo(true)} disabled={procesando}>
              <Repeat className="icon" aria-hidden />
              Cambiar tema
            </button>
          </div>
          <p className="alert alert-warning" role="note" style={{ marginTop: "0.9rem" }}>
            <Lock className="icon" aria-hidden />
            <span className="alert-body">Una vez que comiences a responder no podrás cambiar de tema.</span>
          </p>
        </section>
      )}

      <section className="card">
        <h2 className="section-title" style={{ marginBottom: "0.75rem" }}>
          Antes de comenzar
        </h2>
        <div className="meta" style={{ marginBottom: "1rem" }}>
          {examen.clase && (
            <span className="meta-item">
              <School className="icon" aria-hidden />
              {examen.clase}
            </span>
          )}
          <span className="meta-item">
            <UserRound className="icon" aria-hidden />
            {examen.profesor}
          </span>
          {examen.fechaDisponible && (
            <span className="meta-item">
              <CalendarDays className="icon" aria-hidden />
              {formatFechaCorta(examen.fechaDisponible)}
            </span>
          )}
          <span className="meta-item">
            <Clock className="icon" aria-hidden />
            {examen.duracionMinutos ? `${examen.duracionMinutos} minutos` : "Sin límite de tiempo"}
          </span>
          {examen.cantidadConsignas !== null && (
            <span className="meta-item">
              <ListChecks className="icon" aria-hidden />
              {plural(examen.cantidadConsignas, "pregunta", "preguntas")}
            </span>
          )}
        </div>
        <p className="pre-wrap" style={{ margin: 0 }}>
          {examen.enunciado}
        </p>
        <div style={{ marginTop: "0.9rem" }}>
          <HerramientasBadges escritura={examen.habilitarEscritura} calculadora={examen.habilitarCalculadora} geogebra={examen.habilitarGeoGebra} />
        </div>
        {examen.duracionMinutos && (
          <p className="small muted" style={{ margin: "0.9rem 0 0" }}>
            El tiempo empieza a correr cuando tocás &quot;Comenzar&quot;. Al terminarse, el examen se entrega automáticamente con lo que hayas respondido.
          </p>
        )}
      </section>

      {avisoError}

      <div className="row" style={{ justifyContent: "flex-end" }}>
        {examen.disponible ? (
          <button type="button" className="btn btn-lg" onClick={comenzar} disabled={procesando}>
            {procesando ? <span className="spinner" aria-hidden /> : <Play className="icon" aria-hidden />}
            {procesando ? "Comenzando..." : "Comenzar"}
          </button>
        ) : (
          <span className="status status-pending">
            <Clock className="icon" aria-hidden />
            Disponible desde el {formatFechaCorta(examen.fechaDisponible)}
          </span>
        )}
      </div>
    </div>
  );
}
