"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Lightbulb,
  Pencil,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import { EstadoCorreccionBadge } from "@/components/EstadoBadge";
import RespuestaVista from "@/components/RespuestaVista";
import { TIPO_INFO } from "@/components/TipoPregunta";
import { FieldError, UserAvatar } from "@/components/ui/Misc";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { calcularNotaTotal } from "@/lib/correccion";
import { formatFechaCorta, formatPuntaje } from "@/lib/format";
import type { EntregaProfesorDetalle } from "@/lib/services/profesor";

interface EstadoConsigna {
  puntaje: string;
  feedback: string;
}

export interface NavegacionAlumnos {
  posicion: number;
  total: number;
  anterior: { href: string; nombre: string } | null;
  siguiente: { href: string; nombre: string } | null;
  volver: string;
}

/** Valor inicial del puntaje: lo ya guardado por el profesor o, si no hay, la sugerencia automática. */
function puntajeInicial(c: EntregaProfesorDetalle["consignas"][number]): string {
  if (c.correccion.puntajeObtenido !== null) return String(c.correccion.puntajeObtenido);
  if (c.correccion.fuenteSugerencia === "AUTOMATICA" && c.correccion.puntajeSugerido !== null) {
    return String(c.correccion.puntajeSugerido);
  }
  return "";
}

const aNumero = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

interface Props {
  entrega: EntregaProfesorDetalle;
  navegacion?: NavegacionAlumnos;
  /** Material adicional (ej. gráfico de GeoGebra) que se muestra debajo de la pregunta. */
  anexos?: ReactNode;
}

export default function CorreccionEntrega({ entrega, navegacion, anexos }: Props) {
  const router = useRouter();
  const toast = useToast();
  const puntajeRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Record<string, EstadoConsigna>>(() =>
    Object.fromEntries(
      entrega.consignas.map((c) => [c.id, { puntaje: puntajeInicial(c), feedback: c.correccion.feedback ?? "" }]),
    ),
  );
  const [feedbackGeneral, setFeedbackGeneral] = useState(entrega.feedbackGeneral ?? "");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [actual, setActual] = useState(0);
  const [ignoradas, setIgnoradas] = useState<string[]>([]);
  const [salirA, setSalirA] = useState<string | null>(null);

  const snapshot = JSON.stringify({ estado, feedbackGeneral });
  const [guardado, setGuardado] = useState(snapshot);
  const sinGuardar = snapshot !== guardado;

  const puntajes = entrega.consignas.map((c) => aNumero(estado[c.id].puntaje));
  const notaParcial = calcularNotaTotal(puntajes.map((p) => (p !== null && Number.isFinite(p) ? p : null)));
  const sinPuntaje = puntajes.filter((p) => p === null).length;
  const c = entrega.consignas[actual];
  const e = estado[c.id];
  const sugerencia = c.correccion;

  useEffect(() => {
    if (!sinGuardar) return;
    const onBeforeUnload = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [sinGuardar]);

  function actualizar(id: string, cambios: Partial<EstadoConsigna>) {
    setEstado((s) => ({ ...s, [id]: { ...s[id], ...cambios } }));
    setMensaje(null);
  }

  function validar(finalizar: boolean): boolean {
    const errs: Record<string, string> = {};
    entrega.consignas.forEach((x) => {
      const p = aNumero(estado[x.id].puntaje);
      if (p === null) {
        if (finalizar) errs[x.id] = "Asigná un puntaje para poder marcar como corregido";
      } else if (!Number.isFinite(p) || p < 0 || p > x.puntaje) {
        errs[x.id] = `El puntaje debe estar entre 0 y ${x.puntaje}`;
      }
    });
    setErrores(errs);
    // Si la pregunta visible está bien, se lleva al profesor a la primera con error.
    const primera = entrega.consignas.findIndex((x) => errs[x.id]);
    if (primera >= 0 && !errs[c.id]) setActual(primera);
    return Object.keys(errs).length === 0;
  }

  async function guardar(finalizar: boolean): Promise<boolean> {
    setMensaje(null);
    if (!validar(finalizar)) {
      setConfirmar(false);
      setMensaje({ tipo: "error", texto: "Revisá los puntajes marcados." });
      return false;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/profesor/entregas/${entrega.id}/correccion`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correcciones: entrega.consignas.map((x) => ({
            consignaId: x.id,
            puntajeObtenido: aNumero(estado[x.id].puntaje),
            feedback: estado[x.id].feedback,
          })),
          feedbackGeneral,
          finalizar,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error ?? "No se pudo guardar la corrección" });
        toast.error("No se pudieron guardar los cambios");
        return false;
      }
      setGuardado(snapshot);
      setMensaje({
        tipo: "ok",
        texto: finalizar ? "Corrección finalizada: la entrega quedó como CORREGIDA." : "Corrección guardada.",
      });
      toast.exito(finalizar ? "Corrección finalizada" : "Cambios guardados");
      router.refresh();
      return true;
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor. Tus cambios siguen en pantalla: reintentá." });
      toast.error("No se pudieron guardar los cambios");
      return false;
    } finally {
      setGuardando(false);
      setConfirmar(false);
    }
  }

  /** Navegar a otro alumno sin perder cambios por accidente. */
  function irA(href: string) {
    if (sinGuardar) setSalirA(href);
    else router.push(href);
  }

  const estadoPregunta = (i: number) => {
    const x = entrega.consignas[i];
    if (errores[x.id]) return "error";
    return aNumero(estado[x.id].puntaje) !== null ? "ok" : "pendiente";
  };
  const info = TIPO_INFO[c.tipo];
  const sugerenciaVisible = sugerencia.puntajeSugerido !== null && !ignoradas.includes(c.id);
  const sugerenciaAplicada = aNumero(e.puntaje) === sugerencia.puntajeSugerido;

  return (
    <div className="grading">
      {/* ---------- Encabezado: alumno, navegación entre alumnos, nota ---------- */}
      <header className="grading-head">
        <div className="grading-student">
          <UserAvatar nombre={entrega.alumno.nombre} tamanio="lg" />
          <div style={{ minWidth: 0 }}>
            <h1 className="grading-name">{entrega.alumno.nombre}</h1>
            <p className="grading-sub">
              <span className="truncate">{entrega.examen.titulo}</span>
              {entrega.tema && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate" data-testid="tema-entrega">
                    {entrega.tema.nombre}
                    {entrega.tema.titulo && ` - ${entrega.tema.titulo}`}
                  </span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>Entregado {formatFechaCorta(entrega.fechaEntrega)}</span>
            </p>
          </div>
        </div>

        <div className="grading-head-mid">
          <EstadoCorreccionBadge estado={entrega.estado} />
          {entrega.fechaCorreccion && <span className="xsmall muted">Corregido el {formatFechaCorta(entrega.fechaCorreccion)}</span>}
        </div>

        {navegacion && (
          <div className="student-nav" role="group" aria-label="Navegar entre alumnos">
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-icon"
              onClick={() => navegacion.anterior && irA(navegacion.anterior.href)}
              disabled={!navegacion.anterior}
              aria-label={navegacion.anterior ? `Anterior alumno: ${navegacion.anterior.nombre}` : "Anterior alumno"}
              data-tooltip="Anterior alumno"
              data-tooltip-side="bottom"
            >
              <ChevronLeft className="icon" aria-hidden />
            </button>
            <span className="xsmall muted tabular">
              Alumno {navegacion.posicion} de {navegacion.total}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-icon"
              onClick={() => navegacion.siguiente && irA(navegacion.siguiente.href)}
              disabled={!navegacion.siguiente}
              aria-label={navegacion.siguiente ? `Siguiente alumno: ${navegacion.siguiente.nombre}` : "Siguiente alumno"}
              data-tooltip="Siguiente alumno"
              data-tooltip-side="bottom"
            >
              <ChevronRight className="icon" aria-hidden />
            </button>
          </div>
        )}

        <div className="grading-total">
          <span className="xsmall muted">Nota total</span>
          <span className="grading-total-value tabular" data-testid="nota-total">
            {notaParcial ?? "—"} / {entrega.puntajeMaximo}
          </span>
        </div>
      </header>

      <div className="grading-grid">
        {/* ---------- Lista de preguntas ---------- */}
        <nav className="grading-list" aria-label="Preguntas de la entrega">
          <div className="editor-list-head">
            <span className="eyebrow">Preguntas</span>
            <span className="xsmall muted tabular">
              {entrega.consignas.length - sinPuntaje}/{entrega.consignas.length}
            </span>
          </div>
          <ol className="glist">
            {entrega.consignas.map((x, i) => {
              const st = estadoPregunta(i);
              const p = aNumero(estado[x.id].puntaje);
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    className={`glist-item is-${st}${i === actual ? " is-active" : ""}`}
                    onClick={() => setActual(i)}
                    aria-current={i === actual ? "true" : undefined}
                    aria-label={`Pregunta ${x.orden}: ${st === "ok" ? "con puntaje" : st === "error" ? "con error" : "sin puntaje"}`}
                  >
                    <span className="glist-mark" aria-hidden>
                      {st === "ok" ? <Check width={12} height={12} /> : st === "error" ? <CircleAlert width={12} height={12} /> : null}
                    </span>
                    <span className="grow">
                      <span className="glist-title">Pregunta {x.orden}</span>
                      <span className="glist-type">{TIPO_INFO[x.tipo].label}</span>
                    </span>
                    <span className="glist-score tabular">
                      {p !== null && Number.isFinite(p) ? p : "–"}/{x.puntaje}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <details className="grading-instructions">
            <summary>Instrucciones del examen</summary>
            <p className="pre-wrap">{entrega.examen.enunciado}</p>
          </details>
        </nav>

        {/* ---------- Pregunta actual ---------- */}
        <section key={c.id} className="grading-main" data-testid={`correccion-${c.orden}`} aria-labelledby={`preg-${c.id}`}>
          <div className="grading-q-head">
            <span className="editor-q-num tabular" aria-hidden>
              {String(c.orden).padStart(2, "0")}
            </span>
            <div className="grow">
              <h2 id={`preg-${c.id}`} className="grading-q-title">
                Pregunta {c.orden}
              </h2>
              <div className="row" style={{ gap: "0.5rem" }}>
                <span className="badge badge-outline">
                  <info.Icon className="icon" aria-hidden />
                  {info.label}
                </span>
                <span className="small muted">Máximo: {formatPuntaje(c.puntaje)}</span>
              </div>
            </div>
          </div>

          <div className="grading-block">
            <h3 className="grading-block-title">Enunciado</h3>
            <div className="pre-wrap">{c.texto}</div>
          </div>

          <div className="grading-block is-answer">
            <h3 className="grading-block-title">Respuesta del alumno</h3>
            <RespuestaVista
              tipo={c.tipo}
              texto={c.respuesta}
              opciones={c.opciones}
              opcionSeleccionada={c.opcionSeleccionada}
              diagrama={c.diagrama}
              habilitarEscritura={entrega.examen.habilitarEscritura}
              respuestaCorrecta={c.respuestaCorrecta}
              alturaDiagrama={420}
            />
          </div>

          {(c.criterio || c.respuestaCorrecta !== null) && (
            <div className="grading-block is-criteria">
              <h3 className="grading-block-title">
                <Lightbulb width={14} height={14} aria-hidden />
                Respuesta correcta / criterio esperado
              </h3>
              {c.respuestaCorrecta !== null && <div>Opción correcta: “{c.opciones[c.respuestaCorrecta]}”</div>}
              {c.criterio && <div className="pre-wrap">{c.criterio}</div>}
            </div>
          )}

          <div className="grading-divider" />

          {sugerenciaVisible && (
            <div className="suggestion" data-testid="sugerencia">
              <div className="suggestion-head">
                <Sparkles width={15} height={15} aria-hidden />
                <span className="strong">{sugerencia.fuenteSugerencia === "IA" ? "Sugerencia de IA" : "Corrección automática"}</span>
                <span className="suggestion-score tabular">
                  {sugerencia.puntajeSugerido} / {c.puntaje}
                </span>
              </div>
              {sugerencia.sugerenciaDetalle && (
                <p className="suggestion-reason">
                  <span className="muted">Motivo: </span>
                  {sugerencia.sugerenciaDetalle}
                </p>
              )}
              <p className="suggestion-note">Es una sugerencia: la nota final la decidís vos.</p>
              <div className="suggestion-actions">
                {sugerenciaAplicada ? (
                  <span className="badge badge-success">
                    <Check className="icon" aria-hidden />
                    Sugerencia aplicada
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    onClick={() => actualizar(c.id, { puntaje: String(sugerencia.puntajeSugerido) })}
                  >
                    <Check className="icon" aria-hidden />
                    Aceptar sugerencia
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => puntajeRef.current?.focus()}>
                  <Pencil className="icon" aria-hidden />
                  Editar
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIgnoradas((xs) => [...xs, c.id])}>
                  <X className="icon" aria-hidden />
                  Ignorar
                </button>
              </div>
            </div>
          )}

          <div className="grading-score">
            <div className="field">
              <label className="label" htmlFor={`puntaje-${c.id}`}>
                Puntaje obtenido (0 a {c.puntaje})
              </label>
              <div className="score-big">
                <input
                  ref={puntajeRef}
                  id={`puntaje-${c.id}`}
                  className="input tabular"
                  type="number"
                  min={0}
                  max={c.puntaje}
                  step="0.25"
                  value={e.puntaje}
                  onChange={(ev) => actualizar(c.id, { puntaje: ev.target.value })}
                  aria-invalid={Boolean(errores[c.id])}
                  placeholder="–"
                />
                <span className="score-big-max tabular">/ {c.puntaje}</span>
              </div>
              <div className="chip-row" role="group" aria-label="Puntajes rápidos">
                {[...new Set([0, Math.round((c.puntaje / 2) * 4) / 4, c.puntaje])].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`chip${aNumero(e.puntaje) === p ? " is-active" : ""}`}
                    onClick={() => actualizar(c.id, { puntaje: String(p) })}
                    aria-label={`Asignar ${p} puntos`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {errores[c.id] && <FieldError mensaje={errores[c.id]} />}
            </div>
            <div className="field grow">
              <label className="label" htmlFor={`feedback-${c.id}`}>
                Comentario para el alumno
              </label>
              <textarea
                id={`feedback-${c.id}`}
                className="textarea"
                rows={3}
                value={e.feedback}
                onChange={(ev) => actualizar(c.id, { feedback: ev.target.value })}
                placeholder="Opcional: qué estuvo bien, qué faltó..."
              />
            </div>
          </div>

          <div className="editor-pane-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setActual((i) => i - 1)} disabled={actual === 0}>
              <ArrowLeft className="icon" aria-hidden />
              Pregunta anterior
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setActual((i) => i + 1)}
              disabled={actual === entrega.consignas.length - 1}
            >
              Siguiente pregunta
              <ArrowRight className="icon" aria-hidden />
            </button>
          </div>

          {anexos}
        </section>
      </div>

      {/* ---------- Barra de acciones ---------- */}
      <section className="grading-footer" aria-label="Guardar corrección">
        <details className="grading-general" open={Boolean(feedbackGeneral) || undefined}>
          <summary>Comentario general{feedbackGeneral ? " ✓" : ""}</summary>
          <div className="field">
            <label className="label sr-only" htmlFor="feedback-general">
              Comentario general
            </label>
            <textarea
              id="feedback-general"
              className="textarea"
              rows={2}
              value={feedbackGeneral}
              onChange={(ev) => setFeedbackGeneral(ev.target.value)}
              placeholder="Devolución general sobre el examen"
            />
          </div>
        </details>
        <div className="grading-footer-bar">
          <span className="small muted">
            Nota: <strong className="text-strong tabular">{notaParcial ?? "—"}</strong> / {entrega.puntajeMaximo}
            {sinPuntaje > 0 && ` · ${sinPuntaje} ${sinPuntaje === 1 ? "pregunta" : "preguntas"} sin puntaje`}
          </span>
          {mensaje ? (
            <span className={`save-state ${mensaje.tipo === "ok" ? "is-ok" : "is-error"}`} role={mensaje.tipo === "ok" ? "status" : "alert"}>
              {mensaje.tipo === "ok" ? <CircleCheck width={14} height={14} aria-hidden /> : <CircleAlert width={14} height={14} aria-hidden />}
              {mensaje.texto}
            </span>
          ) : (
            sinGuardar && <span className="save-state is-dirty">Cambios sin guardar</span>
          )}
          <span className="grow" />
          <button type="button" className="btn btn-secondary" onClick={() => guardar(false)} disabled={guardando}>
            {guardando ? <span className="spinner" aria-hidden /> : <Save className="icon" aria-hidden />}
            {guardando ? "Guardando..." : "Guardar corrección"}
          </button>
          <button type="button" className="btn" onClick={() => setConfirmar(true)} disabled={guardando}>
            <CircleCheck className="icon" aria-hidden />
            Finalizar corrección
          </button>
        </div>
      </section>

      <ConfirmModal
        abierto={confirmar}
        titulo="Finalizar corrección"
        icono={CircleCheck}
        mensaje={`La nota final será ${notaParcial ?? 0} / ${entrega.puntajeMaximo}. Podrás volver a modificar la corrección más adelante.`}
        textoConfirmar="Finalizar corrección"
        textoCargando="Guardando..."
        cargando={guardando}
        onConfirmar={() => guardar(true)}
        onCancelar={() => setConfirmar(false)}
      />

      <Modal
        abierto={salirA !== null}
        titulo="Tenés cambios sin guardar"
        descripcion="Si cambiás de alumno ahora vas a perder los puntajes y comentarios que no guardaste."
        icono={CircleAlert}
        onCerrar={() => setSalirA(null)}
        cerrable={!guardando}
        acciones={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setSalirA(null)} disabled={guardando}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const href = salirA!;
                setGuardado(snapshot);
                setSalirA(null);
                router.push(href);
              }}
              disabled={guardando}
            >
              Salir sin guardar
            </button>
            <button
              type="button"
              className="btn"
              disabled={guardando}
              onClick={async () => {
                const href = salirA!;
                if (await guardar(false)) {
                  setSalirA(null);
                  router.push(href);
                } else setSalirA(null);
              }}
            >
              {guardando && <span className="spinner" aria-hidden />}
              Guardar y continuar
            </button>
          </>
        }
      />
    </div>
  );
}
