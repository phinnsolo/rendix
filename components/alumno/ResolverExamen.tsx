"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  CircleAlert,
  CircleCheck,
  CloudOff,
  EyeOff,
  Flag,
  History,
  Layers,
  Timer,
  LogOut,
  Send,
  X,
} from "lucide-react";
import { HerramientasBadges } from "@/components/EstadoBadge";
import { TIPO_INFO } from "@/components/TipoPregunta";
import Calculadora from "@/components/tools/Calculadora";
import DiagramEditor from "@/components/tools/DiagramEditor";
import GeoGebraApplet, { type GgbApi } from "@/components/tools/GeoGebraApplet";
import BrandMark from "@/components/ui/BrandMark";
import { ProgressBar } from "@/components/ui/Misc";
import Modal from "@/components/ui/Modal";
import QuestionNavigator, { LeyendaNavegador } from "@/components/ui/QuestionNavigator";
import type { TipoConsigna } from "@/lib/correccion";
import { diagramaTieneContenido, parsearDiagrama, type Diagrama } from "@/lib/diagrama";
import { formatPuntaje } from "@/lib/format";

export interface ExamenParaResolver {
  id: string;
  titulo: string;
  enunciado: string;
  profesor: string;
  habilitarEscritura: boolean;
  habilitarCalculadora: boolean;
  habilitarGeoGebra: boolean;
  consignas: {
    id: string;
    orden: number;
    texto: string;
    puntaje: number;
    /** Si falta, la consigna es de DESARROLLO (comportamiento original). */
    tipo?: TipoConsigna;
    opciones?: string[];
  }[];
}

/** Respuesta ya guardada en el servidor (avance de un examen en curso). */
export interface RespuestaGuardada {
  consignaId: string;
  texto: string;
  opcionSeleccionada?: number;
  diagrama?: Diagrama;
}

interface Props {
  examen: ExamenParaResolver;
  userId: string;
  /** Tema elegido (exámenes por temas): solo se muestran sus preguntas. */
  tema?: { nombre: string; titulo: string | null } | null;
  /** Fin del tiempo (ISO). Al llegar a cero el examen se entrega automáticamente. */
  fechaLimite?: string | null;
  /** Guarda el avance también en el servidor (además del respaldo local). */
  guardadoRemoto?: boolean;
  /** Avance guardado en el servidor: se usa si no hay respaldo en este navegador. */
  respuestasIniciales?: RespuestaGuardada[];
  geogebraInicial?: string | null;
}

const AUTOGUARDADO_MS = 2500;

function formatReloj(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const seg = total % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${dos(m)}:${dos(seg)}` : `${dos(m)}:${dos(seg)}`;
}

interface BorradorLocal {
  respuestas: Record<string, string>;
  geogebraState: string | null;
  /** Opción elegida por consigna (opción múltiple / V-F). */
  opciones?: Record<string, number>;
  /** Estructura de cada diagrama por consigna. */
  diagramas?: Record<string, Diagrama>;
  /** Preguntas marcadas para revisar (solo ayuda visual, no se envía). */
  marcadas?: string[];
  actualizado: string;
}

type RespuestaEnviada =
  | { consignaId: string; texto: string }
  | { consignaId: string; opcion: number | null }
  | { consignaId: string; diagrama: Diagrama | null };

const tipoDe = (c: { tipo?: TipoConsigna }): TipoConsigna => c.tipo ?? "DESARROLLO";

// Respaldo temporal en localStorage mientras el examen no fue enviado.
// La clave incluye al usuario para no mezclar datos si comparten la computadora.
export const claveBorrador = (userId: string, examenId: string) => `examen-borrador:${userId}:${examenId}`;

function leerBorrador(clave: string): BorradorLocal | null {
  try {
    const raw = window.localStorage.getItem(clave);
    if (!raw) return null;
    const data = JSON.parse(raw) as BorradorLocal;
    return typeof data === "object" && data && typeof data.respuestas === "object" ? data : null;
  } catch {
    return null;
  }
}

const horaCorta = (d: Date) => d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

export default function ResolverExamen({
  examen,
  userId,
  tema = null,
  fechaLimite = null,
  guardadoRemoto = false,
  respuestasIniciales = [],
  geogebraInicial = null,
}: Props) {
  const router = useRouter();
  const clave = claveBorrador(userId, examen.id);
  const ggbApi = useRef<GgbApi | null>(null);

  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [geogebraState, setGeogebraState] = useState<string | null>(null);
  const [opcionesElegidas, setOpcionesElegidas] = useState<Record<string, number>>({});
  const [diagramas, setDiagramas] = useState<Record<string, Diagrama>>({});
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [actual, setActual] = useState(0);
  const [hidratado, setHidratado] = useState(false);
  const [restaurado, setRestaurado] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardadoLocal, setGuardadoLocal] = useState<{ ok: boolean; hora: string } | null>(null);
  const [salioDeLaVentana, setSalioDeLaVentana] = useState(false);
  const [calculadoraVisible, setCalculadoraVisible] = useState(true);
  const [guardadoServidor, setGuardadoServidor] = useState<{ ok: boolean; hora: string } | null>(null);
  const [restante, setRestante] = useState<number | null>(() =>
    fechaLimite ? new Date(fechaLimite).getTime() - Date.now() : null,
  );
  const enviandoRef = useRef(false);
  const autoEnviado = useRef(false);

  // Recupera el respaldo local (si existe) al montar.
  useEffect(() => {
    const borrador = leerBorrador(clave);
    if (borrador) {
      setRespuestas(borrador.respuestas ?? {});
      setGeogebraState(borrador.geogebraState ?? null);
      setOpcionesElegidas(borrador.opciones ?? {});
      setMarcadas(Array.isArray(borrador.marcadas) ? borrador.marcadas : []);
      const recuperados: Record<string, Diagrama> = {};
      for (const [id, d] of Object.entries(borrador.diagramas ?? {})) {
        const valido = parsearDiagrama(d);
        if (valido) recuperados[id] = valido;
      }
      setDiagramas(recuperados);
      setRestaurado(
        Object.keys(borrador.respuestas ?? {}).length > 0 ||
          Boolean(borrador.geogebraState) ||
          Object.keys(borrador.opciones ?? {}).length > 0 ||
          Object.values(recuperados).some(diagramaTieneContenido),
      );
    } else if (respuestasIniciales.length > 0 || geogebraInicial) {
      // Otro navegador / dispositivo: se recupera lo guardado en el servidor.
      setRespuestas(Object.fromEntries(respuestasIniciales.filter((r) => r.texto).map((r) => [r.consignaId, r.texto])));
      setOpcionesElegidas(
        Object.fromEntries(
          respuestasIniciales.filter((r) => r.opcionSeleccionada !== undefined).map((r) => [r.consignaId, r.opcionSeleccionada!]),
        ),
      );
      setDiagramas(Object.fromEntries(respuestasIniciales.filter((r) => r.diagrama).map((r) => [r.consignaId, r.diagrama!])));
      setGeogebraState(geogebraInicial);
      setRestaurado(true);
    }
    setHidratado(true);
    // Solo al montar: el avance del servidor es el estado inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Guarda el respaldo local en cada cambio.
  useEffect(() => {
    if (!hidratado) return;
    try {
      const data: BorradorLocal = {
        respuestas,
        geogebraState,
        opciones: opcionesElegidas,
        diagramas,
        marcadas,
        actualizado: new Date().toISOString(),
      };
      window.localStorage.setItem(clave, JSON.stringify(data));
      setGuardadoLocal({ ok: true, hora: horaCorta(new Date()) });
    } catch {
      // localStorage lleno o deshabilitado: las respuestas siguen en memoria.
      setGuardadoLocal({ ok: false, hora: horaCorta(new Date()) });
    }
  }, [clave, respuestas, geogebraState, opcionesElegidas, diagramas, marcadas, hidratado]);

  // Modo examen: sin scroll de fondo detrás de la vista a pantalla completa.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  // Aviso informativo al volver a la ventana (no se registra ni se envía nada).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") return;
      setSalioDeLaVentana(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /** Cada consigna envía solo el dato de su tipo (lo usan el autoguardado y la entrega). */
  const construirBody = useCallback(
    (estadoGgb: string | null) => ({
      respuestas: examen.consignas.flatMap((c): RespuestaEnviada[] => {
        const tipo = tipoDe(c);
        if (tipo === "DIAGRAMA") return [{ consignaId: c.id, diagrama: diagramas[c.id] ?? null }];
        if (tipo === "OPCION_MULTIPLE" || tipo === "VERDADERO_FALSO") {
          return [{ consignaId: c.id, opcion: opcionesElegidas[c.id] ?? null }];
        }
        return examen.habilitarEscritura ? [{ consignaId: c.id, texto: respuestas[c.id] ?? "" }] : [];
      }),
      geogebraState: examen.habilitarGeoGebra ? estadoGgb : null,
    }),
    [examen, diagramas, opcionesElegidas, respuestas],
  );

  // Autoguardado en el servidor (examen en curso): unos segundos después de cada cambio.
  useEffect(() => {
    if (!guardadoRemoto || !hidratado) return;
    const t = window.setTimeout(async () => {
      if (enviandoRef.current) return;
      try {
        const res = await fetch(`/api/alumno/examenes/${examen.id}/respuestas`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(construirBody(geogebraState)),
        });
        if (res.status === 409) {
          // Ya entregado o se terminó el tiempo: el servidor manda.
          router.refresh();
          return;
        }
        setGuardadoServidor({ ok: res.ok, hora: horaCorta(new Date()) });
      } catch {
        setGuardadoServidor({ ok: false, hora: horaCorta(new Date()) });
      }
    }, AUTOGUARDADO_MS);
    return () => window.clearTimeout(t);
  }, [guardadoRemoto, hidratado, construirBody, geogebraState, examen.id, router]);

  // Reloj: cuenta regresiva hasta el fin del tiempo.
  useEffect(() => {
    if (!fechaLimite) return;
    const fin = new Date(fechaLimite).getTime();
    const id = window.setInterval(() => setRestante(fin - Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [fechaLimite]);

  const onGeoGebraChange = useCallback((base64: string) => setGeogebraState(base64), []);
  const onDiagramaChange = useCallback(
    (consignaId: string, d: Diagrama) => setDiagramas((prev) => ({ ...prev, [consignaId]: d })),
    [],
  );

  const consigna = examen.consignas[actual];
  const respondida = (c: ExamenParaResolver["consignas"][number]) => {
    const tipo = tipoDe(c);
    if (tipo === "DIAGRAMA") return diagramaTieneContenido(diagramas[c.id]);
    if (tipo === "OPCION_MULTIPLE" || tipo === "VERDADERO_FALSO") return opcionesElegidas[c.id] !== undefined;
    return (respuestas[c.id] ?? "").trim() !== "";
  };
  const respondidas = examen.consignas.filter(respondida).length;
  // Se informa el progreso si hay consignas que el alumno puede responder en la plataforma.
  const hayRespondibles = examen.habilitarEscritura || examen.consignas.some((c) => tipoDe(c) !== "DESARROLLO");
  const sinResponder = examen.consignas.filter((c) => !respondida(c));
  const marcadasVisibles = examen.consignas.filter((c) => marcadas.includes(c.id));
  const esUltima = actual === examen.consignas.length - 1;
  const marcadaActual = consigna ? marcadas.includes(consigna.id) : false;

  function alternarMarca(id: string) {
    setMarcadas((ms) => (ms.includes(id) ? ms.filter((x) => x !== id) : [...ms, id]));
  }

  async function enviar() {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setError(null);

    // Se toma el estado más reciente del applet al momento de enviar.
    let estadoGgb = geogebraState;
    if (examen.habilitarGeoGebra && ggbApi.current) {
      try {
        estadoGgb = ggbApi.current.getBase64();
      } catch {
        // Se usa el último estado conocido.
      }
    }

    const body = construirBody(estadoGgb);

    try {
      const res = await fetch(`/api/alumno/examenes/${examen.id}/entrega`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok || res.status === 409) {
        // Entregado (ahora o antes): el respaldo local ya no hace falta.
        try {
          window.localStorage.removeItem(clave);
        } catch {
          /* ignorar */
        }
        setModalAbierto(false);
        router.replace(`/alumno/examenes/${examen.id}${res.ok ? "?enviado=1" : ""}`);
        router.refresh();
        return;
      }
      // Cualquier otro error: NO se borran las respuestas locales, se puede reintentar.
      setError(`${data.error ?? "No se pudo enviar el examen"}. Tus respuestas siguen guardadas: podés reintentar.`);
    } catch {
      setError("No se pudo conectar con el servidor. Tus respuestas siguen guardadas en este navegador: podés reintentar.");
    }
    setModalAbierto(false);
    setEnviando(false);
    enviandoRef.current = false;
  }

  // Se terminó el tiempo: entrega automática (una sola vez).
  const enviarRef = useRef(enviar);
  enviarRef.current = enviar;
  useEffect(() => {
    if (restante === null || restante > 0 || autoEnviado.current || !hidratado) return;
    autoEnviado.current = true;
    void enviarRef.current();
  }, [restante, hidratado]);

  const tipoActual = consigna ? TIPO_INFO[tipoDe(consigna)] : null;

  return (
    <div className="exam-mode" role="region" aria-label={`Modo examen: ${examen.titulo}`}>
      {/* ---------- Header compacto ---------- */}
      <header className="exam-top">
        <div className="exam-top-left">
          <BrandMark size={24} />
          <div className="exam-top-title">
            <span className="exam-top-course truncate">
              {tema ? (
                <>
                  <Layers width={12} height={12} aria-hidden /> {tema.nombre}
                  {tema.titulo && ` · ${tema.titulo}`}
                </>
              ) : (
                examen.profesor
              )}
            </span>
            <h1 className="truncate">{examen.titulo}</h1>
          </div>
        </div>
        <div className="exam-top-center tabular" aria-live="polite">
          Pregunta {actual + 1} <span className="muted">de {examen.consignas.length}</span>
          {restante !== null && (
            <span
              className={`exam-timer${restante < 5 * 60_000 ? " is-low" : ""}`}
              role="timer"
              aria-label={`Tiempo restante: ${formatReloj(restante)}`}
              data-testid="tiempo-restante"
            >
              <Timer width={14} height={14} aria-hidden />
              {formatReloj(restante)}
            </span>
          )}
        </div>
        <div className="exam-top-right">
          {guardadoLocal && (
            <span className={`save-state ${guardadoLocal.ok ? "is-ok" : "is-error"}`} title="Respaldo automático en este navegador">
              {guardadoLocal.ok ? <CircleCheck width={14} height={14} aria-hidden /> : <CloudOff width={14} height={14} aria-hidden />}
              <span className="exam-save-text">
                {guardadoServidor
                  ? guardadoServidor.ok
                    ? `Guardado en el servidor ${guardadoServidor.hora}`
                    : guardadoLocal.ok
                      ? `Guardado en este navegador ${guardadoLocal.hora}`
                      : "Sin respaldo"
                  : guardadoLocal.ok
                    ? `Guardado ${guardadoLocal.hora}`
                    : "Sin respaldo local"}
              </span>
            </span>
          )}
          {examen.habilitarCalculadora && (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon"
              aria-pressed={calculadoraVisible}
              onClick={() => setCalculadoraVisible((v) => !v)}
              aria-label={calculadoraVisible ? "Ocultar calculadora" : "Mostrar calculadora"}
              data-tooltip={calculadoraVisible ? "Ocultar calculadora" : "Mostrar calculadora"}
              data-tooltip-side="bottom"
            >
              <Calculator className="icon" aria-hidden />
            </button>
          )}
          <Link
            href="/alumno"
            className="btn btn-ghost btn-sm btn-icon"
            aria-label={guardadoRemoto ? "Salir (tus respuestas quedan guardadas)" : "Salir (tus respuestas quedan guardadas en este navegador)"}
            data-tooltip="Salir sin entregar"
            data-tooltip-side="bottom"
          >
            <LogOut className="icon" aria-hidden />
          </Link>
          <button type="button" className="btn btn-sm" onClick={() => setModalAbierto(true)} disabled={enviando}>
            {enviando ? <span className="spinner" aria-hidden /> : <Send className="icon" aria-hidden />}
            Entregar examen
          </button>
        </div>
      </header>
      {hayRespondibles && (
        <ProgressBar valor={respondidas} maximo={examen.consignas.length} etiqueta={`Respondiste ${respondidas} de ${examen.consignas.length}`} tamanio="sm" />
      )}

      <div className="exam-body">
        <div className="exam-col">
          {salioDeLaVentana && (
            <div className="alert alert-warning exam-notice" role="status">
              <EyeOff className="icon" aria-hidden />
              <div className="alert-body">
                <span className="alert-title">Saliste de la ventana del examen.</span>
                Tus respuestas siguen guardadas en este navegador. Intentá mantener esta pestaña activa hasta entregar.
              </div>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setSalioDeLaVentana(false)} aria-label="Cerrar aviso">
                <X className="icon" aria-hidden />
              </button>
            </div>
          )}
          {restaurado && (
            <div className="alert alert-info exam-notice" role="status">
              <History className="icon" aria-hidden />
              <div className="alert-body">Recuperamos las respuestas que tenías guardadas en este navegador.</div>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setRestaurado(false)} aria-label="Cerrar aviso">
                <X className="icon" aria-hidden />
              </button>
            </div>
          )}
          {error && (
            <div className="alert alert-error exam-notice" role="alert">
              <CircleAlert className="icon" aria-hidden />
              <div className="alert-body">{error}</div>
            </div>
          )}

          <details className="exam-instructions" open={actual === 0 || undefined}>
            <summary>Instrucciones del examen</summary>
            <p className="pre-wrap">{examen.enunciado}</p>
            <HerramientasBadges escritura={examen.habilitarEscritura} calculadora={examen.habilitarCalculadora} geogebra={examen.habilitarGeoGebra} />
          </details>

          <QuestionNavigator
            preguntas={examen.consignas.map((c) => ({ id: c.id, numero: c.orden, respondida: respondida(c), marcada: marcadas.includes(c.id) }))}
            actual={actual}
            onSeleccionar={setActual}
          />

          {consigna && tipoActual && (
            <section key={consigna.id} role="tabpanel" className="exam-question" aria-labelledby={`q-${consigna.id}`}>
              <header className="exam-q-head">
                <span className="exam-q-num tabular" aria-hidden>
                  {String(consigna.orden).padStart(2, "0")}
                </span>
                <div className="grow">
                  <h2 id={`q-${consigna.id}`} className="exam-q-title">
                    Pregunta {consigna.orden}
                  </h2>
                  <span className="small muted">
                    {formatPuntaje(consigna.puntaje)}
                    {tipoDe(consigna) !== "DESARROLLO" && ` · ${tipoActual.label}`}
                  </span>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${marcadaActual ? "btn-soft" : "btn-ghost"}`}
                  aria-pressed={marcadaActual}
                  onClick={() => alternarMarca(consigna.id)}
                >
                  <Flag className="icon" aria-hidden />
                  {marcadaActual ? "Marcada para revisar" : "Marcar para revisar"}
                </button>
              </header>

              <div className="exam-q-text pre-wrap">{consigna.texto}</div>

              <div className="exam-answer">
                {tipoDe(consigna) === "OPCION_MULTIPLE" || tipoDe(consigna) === "VERDADERO_FALSO" ? (
                  <fieldset className="answer-options" data-testid="respuesta-opciones">
                    <legend className="exam-answer-label">Elegí una opción</legend>
                    {(consigna.opciones ?? []).map((o, i) => (
                      <label key={i} className={`answer-option${opcionesElegidas[consigna.id] === i ? " is-selected" : ""}`}>
                        <input
                          type="radio"
                          name={`opcion-${consigna.id}`}
                          checked={opcionesElegidas[consigna.id] === i}
                          onChange={() => setOpcionesElegidas((prev) => ({ ...prev, [consigna.id]: i }))}
                          disabled={enviando}
                        />
                        <span className="answer-letter" data-letter={String.fromCharCode(65 + i)} aria-hidden />
                        <span className="grow">{o}</span>
                      </label>
                    ))}
                  </fieldset>
                ) : tipoDe(consigna) === "DIAGRAMA" ? (
                  <div data-testid="respuesta-diagrama">
                    <p className="exam-answer-label">Construí tu diagrama</p>
                    {hidratado && (
                      <DiagramEditor
                        key={consigna.id}
                        value={diagramas[consigna.id] ?? null}
                        onChange={(d) => onDiagramaChange(consigna.id, d)}
                        height={480}
                      />
                    )}
                  </div>
                ) : examen.habilitarEscritura ? (
                  <div className="field" data-testid="herramienta-escritura">
                    <label className="exam-answer-label" htmlFor={`respuesta-${consigna.id}`}>
                      Tu respuesta
                    </label>
                    <textarea
                      id={`respuesta-${consigna.id}`}
                      className="textarea exam-textarea"
                      rows={10}
                      value={respuestas[consigna.id] ?? ""}
                      onChange={(e) => setRespuestas((r) => ({ ...r, [consigna.id]: e.target.value }))}
                      disabled={enviando}
                      placeholder="Escribí tu respuesta acá..."
                    />
                    <span className="field-help tabular" style={{ textAlign: "right" }}>
                      {(respuestas[consigna.id] ?? "").length.toLocaleString("es-AR")} caracteres
                    </span>
                  </div>
                ) : (
                  <p className="small muted">La escritura no está habilitada en este examen.</p>
                )}
              </div>
            </section>
          )}

          <nav className="exam-footer" aria-label="Navegación entre preguntas">
            <button type="button" className="btn btn-secondary" onClick={() => setActual((i) => i - 1)} disabled={actual === 0}>
              <ArrowLeft className="icon" aria-hidden />
              Anterior
            </button>
            {esUltima ? (
              <button type="button" className="btn" onClick={() => setModalAbierto(true)} disabled={enviando}>
                Revisar y entregar
                <Send className="icon" aria-hidden />
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => setActual((i) => i + 1)}>
                Siguiente
                <ArrowRight className="icon" aria-hidden />
              </button>
            )}
          </nav>

          {examen.habilitarGeoGebra && (
            <section className="exam-panel" data-testid="herramienta-geogebra">
              <div className="row-between" style={{ marginBottom: "0.75rem" }}>
                <h2 className="section-title">GeoGebra</h2>
                <span className="xsmall muted">Se guarda automáticamente y se envía con el examen.</span>
              </div>
              {hidratado && <GeoGebraApplet initialState={geogebraState} onChange={onGeoGebraChange} apiRef={ggbApi} />}
            </section>
          )}
        </div>

        <aside className="exam-side" aria-label="Herramientas y progreso">
          <section className="exam-panel">
            <h2 className="eyebrow" style={{ marginBottom: "0.6rem" }}>
              Tu progreso
            </h2>
            {hayRespondibles && (
              <p className="exam-progress-num tabular">
                {respondidas}
                <small> / {examen.consignas.length} respondidas</small>
              </p>
            )}
            <LeyendaNavegador />
          </section>
          {examen.habilitarCalculadora && (
            <div hidden={!calculadoraVisible} className="exam-calc">
              <Calculadora />
            </div>
          )}
        </aside>
      </div>

      <Modal
        abierto={modalAbierto}
        titulo="¿Entregar examen?"
        icono={Send}
        cerrable={!enviando}
        onCerrar={() => setModalAbierto(false)}
        acciones={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setModalAbierto(false)} disabled={enviando}>
              Cancelar
            </button>
            <button type="button" className="btn" onClick={enviar} disabled={enviando}>
              {enviando && <span className="spinner" aria-hidden />}
              {enviando ? "Enviando..." : "Confirmar envío"}
            </button>
          </>
        }
      >
        {hayRespondibles && (
          <p>
            Respondiste <strong className="text-strong">{respondidas} de {examen.consignas.length}</strong> preguntas.
          </p>
        )}
        {hayRespondibles && sinResponder.length > 0 && (
          <div className="submit-summary">
            <span>Sin responder:</span>
            {sinResponder.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip"
                onClick={() => {
                  setActual(examen.consignas.indexOf(c));
                  setModalAbierto(false);
                }}
              >
                {c.orden}
              </button>
            ))}
          </div>
        )}
        {marcadasVisibles.length > 0 && (
          <div className="submit-summary">
            <span>
              <Flag width={12} height={12} aria-hidden /> Para revisar:
            </span>
            {marcadasVisibles.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip"
                onClick={() => {
                  setActual(examen.consignas.indexOf(c));
                  setModalAbierto(false);
                }}
              >
                {c.orden}
              </button>
            ))}
          </div>
        )}
        {tema && (
          <p>
            Vas a entregar el <strong className="text-strong">{tema.nombre}</strong>
            {tema.titulo && ` (${tema.titulo})`}.
          </p>
        )}
        <p>Una vez entregado no vas a poder modificarlo.</p>
      </Modal>
    </div>
  );
}
