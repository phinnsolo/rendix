"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Calculator,
  CircleAlert,
  Copy,
  Eye,
  GripVertical,
  Layers,
  Lightbulb,
  ListOrdered,
  PenLine,
  Plus,
  Repeat,
  Save,
  Settings2,
  Spline,
  Trash2,
  X,
} from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import TemaCards from "@/components/TemaCards";
import { ORDEN_TIPOS, TIPO_INFO } from "@/components/TipoPregunta";
import { Field, FieldError } from "@/components/ui/Misc";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { OPCIONES_VF, type TipoConsigna } from "@/lib/correccion";
import { plural } from "@/lib/format";
import {
  DURACION_MAX_MINUTOS,
  examenSchema,
  MAX_OPCIONES,
  MAX_TEMAS,
  PUNTAJE_MAX,
  PUNTAJE_MIN,
  type ModoExamen,
} from "@/lib/validations/examen";

export interface ClaseOpcion {
  id: string;
  nombre: string;
  alumnos: number;
}

interface ConsignaInicial {
  texto: string;
  puntaje: number;
  tipo?: TipoConsigna;
  opciones?: string[];
  respuestaCorrecta?: number | null;
  criterio?: string | null;
}

export interface ExamenFormInicial {
  id: string;
  titulo: string;
  enunciado: string;
  modo?: ModoExamen;
  habilitarEscritura: boolean;
  habilitarCalculadora: boolean;
  habilitarGeoGebra: boolean;
  claseId?: string | null;
  /** ISO 8601 */
  fechaDisponible?: string | null;
  duracionMinutos?: number | null;
  consignas: ConsignaInicial[];
  temas?: { nombre: string; titulo: string | null; descripcion: string | null; consignas: ConsignaInicial[] }[];
}

interface ConsignaState {
  key: number;
  texto: string;
  puntaje: string;
  tipo: TipoConsigna;
  opciones: string[];
  respuestaCorrecta: number | null;
  criterio: string;
}

interface TemaState {
  key: number;
  nombre: string;
  titulo: string;
  descripcion: string;
  consignas: ConsignaState[];
}

type Errores = Record<string, string>;
/** "ajustes" = configuración del examen; "tema" = datos del tema activo; número = una pregunta. */
type Seleccion = "ajustes" | "tema" | number;

let nextKey = 1;
const nuevaConsigna = (datos: Partial<Omit<ConsignaState, "key">> = {}): ConsignaState => ({
  key: nextKey++,
  texto: "",
  puntaje: "",
  tipo: "DESARROLLO",
  opciones: [],
  respuestaCorrecta: null,
  criterio: "",
  ...datos,
});
const nuevoTema = (datos: Partial<Omit<TemaState, "key">> = {}): TemaState => ({
  key: nextKey++,
  nombre: "",
  titulo: "",
  descripcion: "",
  consignas: [],
  ...datos,
});
const desdeInicial = (c: ConsignaInicial) =>
  nuevaConsigna({
    texto: c.texto,
    puntaje: String(c.puntaje),
    tipo: c.tipo ?? "DESARROLLO",
    opciones: c.tipo === "OPCION_MULTIPLE" ? (c.opciones ?? []) : [],
    respuestaCorrecta: c.respuestaCorrecta ?? null,
    criterio: c.criterio ?? "",
  });

const HERRAMIENTAS = [
  { campo: "habilitarEscritura", label: "Escritura", desc: "El alumno escribe sus respuestas", Icon: PenLine },
  { campo: "habilitarCalculadora", label: "Calculadora", desc: "Calculadora básica (+ − × ÷)", Icon: Calculator },
  { campo: "habilitarGeoGebra", label: "GeoGebra", desc: "Graficador GeoGebra embebido", Icon: Spline },
] as const;

const MODOS: { id: ModoExamen; label: string; desc: string; Icon: typeof ListOrdered }[] = [
  { id: "NORMAL", label: "Examen normal", desc: "Todos los alumnos responden las mismas preguntas.", Icon: ListOrdered },
  { id: "POR_TEMAS", label: "Examen por temas", desc: "Cada alumno elige un tema y responde solo sus preguntas.", Icon: Layers },
];

type CampoHerramienta = (typeof HERRAMIENTAS)[number]["campo"];

const CAMPOS_AJUSTES = ["enunciado", "herramientas", "claseId", "fechaDisponible", "duracionMinutos", "modo"];
const num = (i: number) => String(i + 1).padStart(2, "0");
const dos = (n: number) => String(n).padStart(2, "0");

/** ISO → { fecha: "2026-10-15", hora: "10:00" } en la zona horaria del navegador. */
function partirFecha(iso: string | null | undefined) {
  if (!iso) return { fecha: "", hora: "" };
  const d = new Date(iso);
  return { fecha: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`, hora: `${dos(d.getHours())}:${dos(d.getMinutes())}` };
}

interface Props {
  clases: ClaseOpcion[];
  inicial?: ExamenFormInicial;
  /** Clase preseleccionada al crear (ej. desde "Crear examen para esta clase"). */
  claseInicial?: string;
}

export default function ExamenForm({ clases, inicial, claseInicial }: Props) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const enunciadoPreguntaRef = useRef<HTMLTextAreaElement>(null);
  const nombreTemaRef = useRef<HTMLInputElement>(null);

  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [enunciado, setEnunciado] = useState(inicial?.enunciado ?? "");
  const [modo, setModo] = useState<ModoExamen>(inicial?.modo ?? "NORMAL");
  const [herramientas, setHerramientas] = useState<Record<CampoHerramienta, boolean>>({
    habilitarEscritura: inicial?.habilitarEscritura ?? true,
    habilitarCalculadora: inicial?.habilitarCalculadora ?? false,
    habilitarGeoGebra: inicial?.habilitarGeoGebra ?? false,
  });
  const [listaNormal, setListaNormal] = useState<ConsignaState[]>(() =>
    inicial ? inicial.consignas.map(desdeInicial) : [nuevaConsigna()],
  );
  const [temas, setTemas] = useState<TemaState[]>(() =>
    (inicial?.temas ?? []).map((t) =>
      nuevoTema({ nombre: t.nombre, titulo: t.titulo ?? "", descripcion: t.descripcion ?? "", consignas: t.consignas.map(desdeInicial) }),
    ),
  );
  const [temaActivo, setTemaActivo] = useState<number | null>(() => temas[0]?.key ?? null);
  const [claseId, setClaseId] = useState(inicial ? (inicial.claseId ?? "") : (claseInicial ?? ""));
  const [fecha, setFecha] = useState(() => partirFecha(inicial?.fechaDisponible).fecha);
  const [hora, setHora] = useState(() => partirFecha(inicial?.fechaDisponible).hora);
  const [duracion, setDuracion] = useState(inicial?.duracionMinutos ? String(inicial.duracionMinutos) : "");
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // ---- Estado de la interfaz del editor ----
  const [seleccion, setSeleccion] = useState<Seleccion>(() =>
    inicial ? ((inicial.modo === "POR_TEMAS" ? temas[0]?.consignas[0]?.key : listaNormal[0]?.key) ?? "ajustes") : "ajustes",
  );
  const [selectorTipo, setSelectorTipo] = useState<{ modo: "nueva" } | { modo: "cambiar"; key: number } | null>(null);
  const [aEliminar, setAEliminar] = useState<number | null>(null);
  const [temaAEliminar, setTemaAEliminar] = useState<number | null>(null);
  const [confirmarModoNormal, setConfirmarModoNormal] = useState(false);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [arrastrada, setArrastrada] = useState<number | null>(null);
  const [destino, setDestino] = useState<number | null>(null);
  const [pedidoFoco, setPedidoFoco] = useState(0);
  const [pedidoFocoTema, setPedidoFocoTema] = useState(0);

  // ---- Lista de preguntas "actual": la del examen (normal) o la del tema activo (por temas) ----
  const porTemas = modo === "POR_TEMAS";
  const indiceTema = porTemas ? temas.findIndex((t) => t.key === temaActivo) : -1;
  const tema = indiceTema >= 0 ? temas[indiceTema] : null;
  const consignas = porTemas ? (tema?.consignas ?? []) : listaNormal;
  const prefijo = porTemas ? `temas.${indiceTema}.consignas` : "consignas";

  function setConsignas(cambio: ConsignaState[] | ((cs: ConsignaState[]) => ConsignaState[])) {
    const aplicar = (cs: ConsignaState[]) => (typeof cambio === "function" ? cambio(cs) : cambio);
    if (!porTemas) return setListaNormal(aplicar);
    setTemas((ts) => ts.map((t) => (t.key === temaActivo ? { ...t, consignas: aplicar(t.consignas) } : t)));
  }

  // "Cambios sin guardar": se compara contra la primera instantánea.
  const sinKeys = (cs: ConsignaState[]) => cs.map((c) => ({ ...c, key: 0 }));
  const instantanea = JSON.stringify({
    titulo,
    enunciado,
    modo,
    herramientas,
    consignas: sinKeys(listaNormal),
    temas: temas.map((t) => ({ ...t, key: 0, consignas: sinKeys(t.consignas) })),
    claseId,
    fecha,
    hora,
    duracion,
  });
  const [inicialSnapshot] = useState(instantanea);
  const sinGuardar = instantanea !== inicialSnapshot;

  useEffect(() => {
    if (!sinGuardar || guardando) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [sinGuardar, guardando]);

  // Ctrl/Cmd + S guarda.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (pedidoFoco > 0) enunciadoPreguntaRef.current?.focus();
  }, [pedidoFoco]);
  useEffect(() => {
    if (pedidoFocoTema > 0) nombreTemaRef.current?.focus();
  }, [pedidoFocoTema]);

  function actualizarConsigna(key: number, cambios: Partial<ConsignaState>) {
    setConsignas((cs) => cs.map((c) => (c.key === key ? { ...c, ...cambios } : c)));
  }

  function cambiarTipo(key: number, tipo: TipoConsigna) {
    setConsignas((cs) =>
      cs.map((c) =>
        c.key !== key
          ? c
          : {
              ...c,
              tipo,
              opciones: tipo === "OPCION_MULTIPLE" ? (c.opciones.length >= 2 ? c.opciones : ["", ""]) : [],
              respuestaCorrecta: null,
            },
      ),
    );
  }

  function actualizarOpcion(key: number, index: number, texto: string) {
    setConsignas((cs) =>
      cs.map((c) => (c.key === key ? { ...c, opciones: c.opciones.map((o, i) => (i === index ? texto : o)) } : c)),
    );
  }

  function eliminarOpcion(key: number, index: number) {
    setConsignas((cs) =>
      cs.map((c) => {
        if (c.key !== key) return c;
        const rc = c.respuestaCorrecta;
        return {
          ...c,
          opciones: c.opciones.filter((_, i) => i !== index),
          respuestaCorrecta: rc === null || rc === index ? null : rc > index ? rc - 1 : rc,
        };
      }),
    );
  }

  function moverEn<T>(lista: T[], index: number, delta: -1 | 1): T[] {
    const destino = index + delta;
    if (destino < 0 || destino >= lista.length) return lista;
    const copia = [...lista];
    [copia[index], copia[destino]] = [copia[destino], copia[index]];
    return copia;
  }

  function moverConsigna(index: number, delta: -1 | 1) {
    setConsignas((cs) => moverEn(cs, index, delta));
  }

  /** Reordenamiento por arrastrar y soltar: coloca `key` en la posición de `sobre`. */
  function soltarEn(key: number, sobre: number) {
    if (key === sobre) return;
    setConsignas((cs) => {
      const desde = cs.findIndex((c) => c.key === key);
      const hasta = cs.findIndex((c) => c.key === sobre);
      if (desde < 0 || hasta < 0) return cs;
      const copia = [...cs];
      const [item] = copia.splice(desde, 1);
      copia.splice(hasta, 0, item);
      return copia;
    });
  }

  function agregarPregunta(tipo: TipoConsigna) {
    const nueva = nuevaConsigna({ tipo, opciones: tipo === "OPCION_MULTIPLE" ? ["", ""] : [] });
    setConsignas((cs) => [...cs, nueva]);
    setSeleccion(nueva.key);
    setPedidoFoco((n) => n + 1);
  }

  function duplicar(key: number) {
    const i = consignas.findIndex((c) => c.key === key);
    if (i < 0) return;
    const copia = nuevaConsigna({ ...consignas[i], opciones: [...consignas[i].opciones] });
    setConsignas((cs) => [...cs.slice(0, i + 1), copia, ...cs.slice(i + 1)]);
    setSeleccion(copia.key);
    toast.info(`Pregunta ${num(i)} duplicada`);
  }

  function eliminar(key: number) {
    const i = consignas.findIndex((c) => c.key === key);
    const restantes = consignas.filter((c) => c.key !== key);
    setConsignas(restantes);
    if (seleccion === key) setSeleccion(restantes[Math.min(i, restantes.length - 1)]?.key ?? (porTemas ? "tema" : "ajustes"));
    setAEliminar(null);
    toast.mostrar("Pregunta eliminada", "info");
  }

  function pedirEliminar(c: ConsignaState) {
    const tieneContenido = c.texto.trim() || c.criterio.trim() || c.opciones.some((o) => o.trim());
    if (tieneContenido) setAEliminar(c.key);
    else eliminar(c.key);
  }

  // ---- Temas ----
  function actualizarTema(key: number, cambios: Partial<Omit<TemaState, "key" | "consignas">>) {
    setTemas((ts) => ts.map((t) => (t.key === key ? { ...t, ...cambios } : t)));
  }

  function abrirTema(key: number) {
    setTemaActivo(key);
    setSeleccion("tema");
  }

  function agregarTema() {
    const t = nuevoTema({ nombre: `Tema ${temas.length + 1}` });
    setTemas((ts) => [...ts, t]);
    abrirTema(t.key);
    setPedidoFocoTema((n) => n + 1);
  }

  function eliminarTema(key: number) {
    const i = temas.findIndex((t) => t.key === key);
    const restantes = temas.filter((t) => t.key !== key);
    setTemas(restantes);
    if (temaActivo === key) {
      const siguiente = restantes[Math.min(i, restantes.length - 1)];
      setTemaActivo(siguiente?.key ?? null);
      setSeleccion(siguiente ? "tema" : "ajustes");
    }
    setTemaAEliminar(null);
    toast.mostrar("Tema eliminado", "info");
  }

  function pedirEliminarTema(t: TemaState) {
    const tieneContenido = t.titulo.trim() || t.descripcion.trim() || t.consignas.some((c) => c.texto.trim());
    if (tieneContenido) setTemaAEliminar(t.key);
    else eliminarTema(t.key);
  }

  /** Cambio de modo: las preguntas nunca se pierden, se mueven a la nueva estructura. */
  function cambiarModo(nuevo: ModoExamen) {
    if (nuevo === modo) return;
    if (nuevo === "POR_TEMAS") {
      const t = nuevoTema({ nombre: "Tema 1", consignas: listaNormal });
      setTemas([t]);
      setListaNormal([]);
      setTemaActivo(t.key);
      setModo("POR_TEMAS");
      if (listaNormal.some((c) => c.texto.trim())) toast.info("Las preguntas existentes pasaron al Tema 1");
      return;
    }
    const tieneTemas = temas.length > 1 || temas.some((t) => t.titulo.trim() || t.descripcion.trim());
    if (tieneTemas && !confirmarModoNormal) {
      setConfirmarModoNormal(true);
      return;
    }
    setListaNormal(temas.flatMap((t) => t.consignas));
    setTemas([]);
    setTemaActivo(null);
    setModo("NORMAL");
    setSeleccion("ajustes");
    setConfirmarModoNormal(false);
  }

  function construirPayload() {
    // "" no es 0: un puntaje vacío se manda como NaN para que la validación lo rechace.
    const aPayload = (cs: ConsignaState[]) =>
      cs.map((c) => ({
        texto: c.texto,
        puntaje: c.puntaje.trim() === "" ? Number.NaN : Number(c.puntaje),
        tipo: c.tipo,
        opciones: c.tipo === "VERDADERO_FALSO" ? OPCIONES_VF : c.opciones,
        respuestaCorrecta: c.respuestaCorrecta,
        criterio: c.criterio,
      }));
    const fechaHora = fecha ? new Date(`${fecha}T${hora || "00:00"}`) : null;
    return {
      titulo,
      enunciado,
      modo,
      ...herramientas,
      consignas: porTemas ? [] : aPayload(listaNormal),
      temas: porTemas
        ? temas.map((t) => ({ nombre: t.nombre, titulo: t.titulo, descripcion: t.descripcion, consignas: aPayload(t.consignas) }))
        : [],
      claseId: claseId || null,
      fechaDisponible: fechaHora && !Number.isNaN(fechaHora.getTime()) ? fechaHora.toISOString() : fecha ? "invalida" : null,
      duracionMinutos: duracion.trim() === "" ? null : Number(duracion),
    };
  }

  /** Lleva al usuario a la primera sección con errores. */
  function irAlPrimerError(errs: Errores) {
    const claves = Object.keys(errs);
    if (claves.some((k) => CAMPOS_AJUSTES.includes(k))) return setSeleccion("ajustes");
    for (const k of claves) {
      const enTema = k.match(/^temas\.(\d+)\.(?:consignas\.(\d+)\.)?/);
      if (enTema && temas[Number(enTema[1])]) {
        const t = temas[Number(enTema[1])];
        setTemaActivo(t.key);
        const c = enTema[2] !== undefined ? t.consignas[Number(enTema[2])] : undefined;
        return setSeleccion(c ? c.key : "tema");
      }
      const enNormal = k.match(/^consignas\.(\d+)\./);
      if (enNormal && listaNormal[Number(enNormal[1])]) return setSeleccion(listaNormal[Number(enNormal[1])].key);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorGeneral(null);

    const payload = construirPayload();
    const parsed = examenSchema.safeParse(payload);
    if (!parsed.success) {
      const errs: Errores = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "general";
        errs[key] ??= issue.message;
      }
      setErrores(errs);
      setErrorGeneral("Revisá los campos marcados antes de guardar.");
      irAlPrimerError(errs);
      return;
    }
    setErrores({});

    setGuardando(true);
    try {
      const res = await fetch(inicial ? `/api/profesor/examenes/${inicial.id}` : "/api/profesor/examenes", {
        method: inicial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(data.detalles)) {
          const errs: Errores = {};
          for (const d of data.detalles as { campo: string; mensaje: string }[]) errs[d.campo || "general"] ??= d.mensaje;
          setErrores(errs);
          irAlPrimerError(errs);
        }
        setErrorGeneral(data.error ?? "No se pudo guardar el examen");
        toast.error("No se pudieron guardar los cambios");
        setGuardando(false);
        return;
      }
      router.push(`/profesor/examenes/${data.examen.id}?guardado=1`);
      router.refresh();
    } catch {
      setErrorGeneral("No se pudo conectar con el servidor. Tus datos siguen en el formulario, intentá nuevamente.");
      toast.error("No se pudieron guardar los cambios");
      setGuardando(false);
    }
  }

  const todas = porTemas ? temas.flatMap((t) => t.consignas) : listaNormal;
  const puntajeTotal = consignas.reduce((acc, c) => acc + (Number(c.puntaje) || 0), 0);
  const indiceSel = typeof seleccion === "number" ? consignas.findIndex((c) => c.key === seleccion) : -1;
  const actual = indiceSel >= 0 ? consignas[indiceSel] : null;
  const errDe = (i: number, campo: string) => errores[`${prefijo}.${i}.${campo}`];
  const preguntaConError = (i: number) => Object.keys(errores).some((k) => k.startsWith(`${prefijo}.${i}.`));
  const temaConError = (i: number) => Object.keys(errores).some((k) => k.startsWith(`temas.${i}.`));
  const errTema = (campo: string) => errores[`temas.${indiceTema}.${campo}`];
  const ajustesConError = CAMPOS_AJUSTES.some((k) => errores[k]);
  const claseElegida = clases.find((c) => c.id === claseId);

  // Resumen de errores navegable.
  const resumenErrores = useMemo(() => {
    const items: { ir: () => void; etiqueta: string; mensaje: string }[] = [];
    if (errores.titulo) items.push({ ir: () => document.getElementById("titulo")?.focus(), etiqueta: "Título", mensaje: errores.titulo });
    for (const k of CAMPOS_AJUSTES) {
      if (errores[k]) items.push({ ir: () => setSeleccion("ajustes"), etiqueta: "Configuración", mensaje: errores[k] });
    }
    listaNormal.forEach((c, i) => {
      const k = Object.keys(errores).find((x) => x.startsWith(`consignas.${i}.`));
      if (k) items.push({ ir: () => setSeleccion(c.key), etiqueta: `Pregunta ${num(i)}`, mensaje: errores[k] });
    });
    temas.forEach((t, i) => {
      const k = Object.keys(errores).find((x) => x.startsWith(`temas.${i}.`));
      if (!k) return;
      const c = k.match(/^temas\.\d+\.consignas\.(\d+)\./);
      const consigna = c ? t.consignas[Number(c[1])] : undefined;
      items.push({
        ir: () => {
          setTemaActivo(t.key);
          setSeleccion(consigna ? consigna.key : "tema");
        },
        etiqueta: `${t.nombre || `Tema ${i + 1}`}${consigna ? ` · Pregunta ${num(Number(c![1]))}` : ""}`,
        mensaje: errores[k],
      });
    });
    if (errores.consignas) items.push({ ir: () => setSeleccion("ajustes"), etiqueta: "Preguntas", mensaje: errores.consignas });
    if (errores.temas) items.push({ ir: () => setSeleccion("ajustes"), etiqueta: "Temas", mensaje: errores.temas });
    return items;
  }, [errores, listaNormal, temas]);

  const listaPreguntas = (
    <>
      <div className="editor-list-head">
        <span className="eyebrow">{porTemas ? `Preguntas · ${tema?.nombre || "Tema"}` : "Preguntas"}</span>
        <span className="xsmall muted tabular">{consignas.length}</span>
      </div>

      {consignas.length === 0 ? (
        <p className="xsmall muted editor-list-empty">Todavía no hay preguntas{porTemas ? " en este tema" : ""}.</p>
      ) : (
        <ol className="qlist">
          {consignas.map((c, i) => {
            const { Icon, label } = TIPO_INFO[c.tipo];
            const sel = seleccion === c.key;
            return (
              <li
                key={c.key}
                data-testid="pregunta-item"
                className={`qlist-item${sel ? " is-active" : ""}${arrastrada === c.key ? " is-dragging" : ""}${destino === c.key && arrastrada !== c.key ? " is-over" : ""}${preguntaConError(i) ? " has-error" : ""}`}
                draggable
                onDragStart={(e) => {
                  setArrastrada(c.key);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(c.key));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (destino !== c.key) setDestino(c.key);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (arrastrada !== null) soltarEn(arrastrada, c.key);
                  setArrastrada(null);
                  setDestino(null);
                }}
                onDragEnd={() => {
                  setArrastrada(null);
                  setDestino(null);
                }}
              >
                <span className="qlist-grip" aria-hidden>
                  <GripVertical width={14} height={14} />
                </span>
                <button
                  type="button"
                  className="qlist-select"
                  onClick={() => setSeleccion(c.key)}
                  aria-current={sel ? "true" : undefined}
                  aria-label={`Pregunta ${i + 1}: ${label}${preguntaConError(i) ? " (con errores)" : ""}`}
                  onKeyDown={(e) => {
                    if (e.altKey && e.key === "ArrowUp") {
                      e.preventDefault();
                      moverConsigna(i, -1);
                    } else if (e.altKey && e.key === "ArrowDown") {
                      e.preventDefault();
                      moverConsigna(i, 1);
                    }
                  }}
                >
                  <span className="qlist-num tabular">{num(i)}</span>
                  <span className="qlist-text">
                    <span className="qlist-type">
                      <Icon width={13} height={13} aria-hidden />
                      {label}
                    </span>
                    <span className={`qlist-snippet${c.texto.trim() ? "" : " is-empty"}`}>{c.texto.trim() || "Sin enunciado"}</span>
                  </span>
                  <span className="qlist-pts tabular">{c.puntaje.trim() ? `${c.puntaje} pts` : "— pts"}</span>
                  {preguntaConError(i) && <CircleAlert className="icon is-error" width={14} height={14} aria-hidden />}
                </button>
                <span className="qlist-actions">
                  <button type="button" className="icon-btn" onClick={() => moverConsigna(i, -1)} disabled={i === 0} aria-label={`Subir pregunta ${i + 1}`} data-tooltip="Subir">
                    <ArrowUp width={14} height={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => moverConsigna(i, 1)}
                    disabled={i === consignas.length - 1}
                    aria-label={`Bajar pregunta ${i + 1}`}
                    data-tooltip="Bajar"
                  >
                    <ArrowDown width={14} height={14} aria-hidden />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => duplicar(c.key)} aria-label={`Duplicar pregunta ${i + 1}`} data-tooltip="Duplicar">
                    <Copy width={14} height={14} aria-hidden />
                  </button>
                  <button type="button" className="icon-btn is-danger" onClick={() => pedirEliminar(c)} aria-label={`Eliminar pregunta ${i + 1}`} data-tooltip="Eliminar">
                    <Trash2 width={14} height={14} aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {!porTemas && errores.consignas && <FieldError mensaje={errores.consignas} />}
      {porTemas && errTema("consignas") && <FieldError mensaje={errTema("consignas")} />}

      <button type="button" className="btn btn-soft btn-block editor-add" onClick={() => setSelectorTipo({ modo: "nueva" })}>
        <Plus className="icon" aria-hidden />
        Agregar pregunta
      </button>
      <p className="xsmall subtle editor-list-hint">
        Arrastrá para reordenar o usá <span className="kbd">Alt</span> + <span className="kbd">↑</span>/<span className="kbd">↓</span>.
      </p>
    </>
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} className="editor" noValidate>
      {/* ---------- Barra superior del editor ---------- */}
      <div className="editor-bar">
        <Link href={inicial ? `/profesor/examenes/${inicial.id}` : "/profesor/examenes"} className="btn btn-ghost btn-icon btn-sm" aria-label="Volver" data-tooltip="Volver" data-tooltip-side="bottom">
          <ArrowLeft className="icon" aria-hidden />
        </Link>
        <div className="editor-title">
          <label htmlFor="titulo" className="editor-title-label">
            Título del examen <span aria-hidden>*</span>
          </label>
          <input
            id="titulo"
            className="editor-title-input"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            aria-invalid={Boolean(errores.titulo)}
            aria-describedby={errores.titulo ? "titulo-error" : undefined}
            maxLength={200}
            placeholder="Ej.: Parcial 1 - Álgebra"
          />
          {errores.titulo && <FieldError id="titulo-error" mensaje={errores.titulo} />}
        </div>
        <div className="editor-bar-meta">
          <span className="status status-draft">Borrador</span>
          <span className="small muted tabular">
            {porTemas
              ? `${plural(temas.length, "tema", "temas")} · ${plural(todas.length, "pregunta", "preguntas")}`
              : `${plural(consignas.length, "pregunta", "preguntas")} · ${puntajeTotal} pts`}
          </span>
          <span className={`save-state${sinGuardar ? " is-dirty" : ""}`} aria-live="polite">
            {guardando ? "Guardando..." : sinGuardar ? "Cambios sin guardar" : inicial ? "Sin cambios" : "Nuevo"}
          </span>
        </div>
        <div className="editor-bar-actions">
          {porTemas && temas.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setVistaPrevia(true)}>
              <Eye className="icon" aria-hidden />
              Vista previa
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => router.back()} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={guardando} title="Guardar (Ctrl+S)">
            {guardando ? <span className="spinner" aria-hidden /> : <Save className="icon" aria-hidden />}
            {guardando ? "Guardando..." : "Guardar borrador"}
          </button>
        </div>
      </div>

      {errorGeneral && (
        <div className="alert alert-error editor-alert" role="alert">
          <CircleAlert className="icon" aria-hidden />
          <div className="alert-body">
            <span className="alert-title">{errorGeneral}</span>
            {resumenErrores.length > 0 && (
              <ul className="error-summary">
                {resumenErrores.map((r, i) => (
                  <li key={i}>
                    <button type="button" className="link-button" onClick={r.ir}>
                      {r.etiqueta}
                    </button>
                    : <span>{r.mensaje}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className={`editor-grid${actual ? "" : " no-aside"}`}>
        {/* ---------- Panel izquierdo: estructura ---------- */}
        <nav className="editor-list" aria-label="Estructura del examen">
          <button
            type="button"
            className={`editor-settings-btn${seleccion === "ajustes" ? " is-active" : ""}`}
            aria-current={seleccion === "ajustes" ? "true" : undefined}
            onClick={() => setSeleccion("ajustes")}
          >
            <Settings2 className="icon" aria-hidden />
            <span className="grow">Configuración del examen</span>
            {ajustesConError && <CircleAlert className="icon is-error" aria-label="Tiene errores" />}
          </button>

          {porTemas ? (
            <>
              <div className="editor-list-head">
                <span className="eyebrow">Temas</span>
                <span className="xsmall muted tabular">{temas.length}</span>
              </div>
              {temas.length === 0 ? (
                <p className="xsmall muted editor-list-empty">Todavía no hay temas.</p>
              ) : (
                <ol className="topic-list">
                  {temas.map((t, i) => (
                    <li key={t.key} data-testid="tema-item" className={`topic-item${temaActivo === t.key ? " is-active" : ""}${temaConError(i) ? " has-error" : ""}`}>
                      <button
                        type="button"
                        className="topic-item-select"
                        onClick={() => abrirTema(t.key)}
                        aria-current={temaActivo === t.key ? "true" : undefined}
                        aria-label={`${t.nombre || `Tema ${i + 1}`}${temaConError(i) ? " (con errores)" : ""}`}
                      >
                        <span className="topic-item-name">{t.nombre || `Tema ${i + 1}`}</span>
                        <span className={`topic-item-title${t.titulo.trim() ? "" : " is-empty"}`}>{t.titulo.trim() || "Sin título"}</span>
                        <span className="topic-item-count tabular">{plural(t.consignas.length, "pregunta", "preguntas")}</span>
                        {temaConError(i) && <CircleAlert className="icon is-error" width={14} height={14} aria-hidden />}
                      </button>
                      <span className="qlist-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setTemas((ts) => moverEn(ts, i, -1))}
                          disabled={i === 0}
                          aria-label={`Subir ${t.nombre || `tema ${i + 1}`}`}
                          data-tooltip="Subir"
                        >
                          <ArrowUp width={14} height={14} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setTemas((ts) => moverEn(ts, i, 1))}
                          disabled={i === temas.length - 1}
                          aria-label={`Bajar ${t.nombre || `tema ${i + 1}`}`}
                          data-tooltip="Bajar"
                        >
                          <ArrowDown width={14} height={14} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="icon-btn is-danger"
                          onClick={() => pedirEliminarTema(t)}
                          aria-label={`Eliminar ${t.nombre || `tema ${i + 1}`}`}
                          data-tooltip="Eliminar"
                        >
                          <Trash2 width={14} height={14} aria-hidden />
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {errores.temas && <FieldError mensaje={errores.temas} />}
              {temas.length < MAX_TEMAS && (
                <button type="button" className="btn btn-secondary btn-block editor-add" onClick={agregarTema}>
                  <Plus className="icon" aria-hidden />
                  Agregar tema
                </button>
              )}
              {tema && <div className="topic-questions">{listaPreguntas}</div>}
            </>
          ) : (
            listaPreguntas
          )}
        </nav>

        {/* ---------- Panel central ---------- */}
        <section className="editor-main" aria-live="polite">
          {seleccion === "ajustes" || (actual === null && !(seleccion === "tema" && tema)) ? (
            <div key="ajustes" className="editor-pane">
              <header className="editor-pane-head">
                <span className="editor-pane-icon" aria-hidden>
                  <Settings2 width={18} height={18} />
                </span>
                <div>
                  <h2>Configuración del examen</h2>
                  <p className="muted small">Instrucciones, modo, herramientas y a qué clase se asigna.</p>
                </div>
              </header>

              <Field
                id="enunciado"
                label="Instrucciones / enunciado general"
                requerido
                error={errores.enunciado}
                ayuda="Lo ven todos los alumnos al comenzar: modalidad, materiales permitidos, criterios generales."
              >
                <textarea
                  id="enunciado"
                  className="textarea"
                  rows={5}
                  value={enunciado}
                  onChange={(e) => setEnunciado(e.target.value)}
                  aria-invalid={Boolean(errores.enunciado)}
                  placeholder="Ej.: Resolvé las siguientes preguntas. Justificá cada respuesta. Tenés 90 minutos."
                />
              </Field>

              <fieldset className="fieldset">
                <legend className="label">Modo del examen</legend>
                <div className="choice-grid">
                  {MODOS.map((m) => (
                    <label key={m.id} className="choice">
                      <input type="radio" name="modo" checked={modo === m.id} onChange={() => cambiarModo(m.id)} />
                      <span className="grow">
                        <span className="choice-title">{m.label}</span>
                        <span className="choice-desc">{m.desc}</span>
                      </span>
                      <m.Icon width={18} height={18} className="subtle" aria-hidden />
                    </label>
                  ))}
                </div>
                {errores.modo && <FieldError mensaje={errores.modo} />}
              </fieldset>

              <fieldset className="fieldset">
                <legend className="label">Herramientas habilitadas</legend>
                <p className="field-help" style={{ margin: "0 0 0.6rem" }}>
                  Las preguntas de opciones y de árbol de decisión traen su propio modo de respuesta.
                </p>
                <div className="choice-grid">
                  {HERRAMIENTAS.map((h) => (
                    <label key={h.campo} className="choice">
                      <input
                        type="checkbox"
                        checked={herramientas[h.campo]}
                        onChange={(e) => setHerramientas((prev) => ({ ...prev, [h.campo]: e.target.checked }))}
                      />
                      <span className="grow">
                        <span className="choice-title">{h.label}</span>
                        <span className="choice-desc">{h.desc}</span>
                      </span>
                      <h.Icon width={18} height={18} className="subtle" aria-hidden />
                    </label>
                  ))}
                </div>
                {errores.herramientas && <FieldError mensaje={errores.herramientas} />}
              </fieldset>

              <fieldset className="fieldset">
                <legend className="label">Asignación</legend>
                <div className="schedule-grid">
                  <Field
                    id="claseId"
                    label="Asignar a"
                    error={errores.claseId}
                    ayuda={
                      claseElegida
                        ? `Lo verán los ${plural(claseElegida.alumnos, "alumno", "alumnos")} de la clase, y también los que se agreguen después.`
                        : "Obligatoria para publicar. Podés guardar el borrador sin clase."
                    }
                  >
                    <select id="claseId" className="select" value={claseId} onChange={(e) => setClaseId(e.target.value)} aria-invalid={Boolean(errores.claseId)}>
                      <option value="">Sin clase todavía</option>
                      {clases.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} ({plural(c.alumnos, "alumno", "alumnos")})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="fecha" label="Fecha" opcional error={errores.fechaDisponible}>
                    <input id="fecha" type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                  </Field>
                  <Field id="hora" label="Hora" opcional>
                    <input id="hora" type="time" className="input" value={hora} onChange={(e) => setHora(e.target.value)} disabled={!fecha} />
                  </Field>
                  <Field id="duracion" label="Duración (minutos)" opcional error={errores.duracionMinutos}>
                    <input
                      id="duracion"
                      type="number"
                      className="input tabular"
                      min={1}
                      max={DURACION_MAX_MINUTOS}
                      step={1}
                      value={duracion}
                      onChange={(e) => setDuracion(e.target.value)}
                      placeholder="Sin límite"
                      aria-invalid={Boolean(errores.duracionMinutos)}
                    />
                  </Field>
                </div>
                {clases.length === 0 && (
                  <p className="field-help" style={{ margin: "0.6rem 0 0" }}>
                    Todavía no tenés clases. <Link href="/profesor/clases" className="text-link">Creá una clase</Link> y agregale alumnos.
                  </p>
                )}
                <p className="field-help" style={{ margin: "0.6rem 0 0" }}>
                  Sin fecha, el examen se puede rendir apenas se publica. La duración empieza a correr cuando cada alumno comienza.
                </p>
              </fieldset>

              <div className="editor-pane-foot">
                <span />
                {porTemas ? (
                  temas[0] ? (
                    <button type="button" className="btn btn-secondary" onClick={() => abrirTema(temas[0].key)}>
                      Ir a los temas
                      <ArrowRight className="icon" aria-hidden />
                    </button>
                  ) : (
                    <button type="button" className="btn btn-soft" onClick={agregarTema}>
                      <Plus className="icon" aria-hidden />
                      Agregar tema
                    </button>
                  )
                ) : (
                  consignas[0] && (
                    <button type="button" className="btn btn-secondary" onClick={() => setSeleccion(consignas[0].key)}>
                      Ir a las preguntas
                      <ArrowRight className="icon" aria-hidden />
                    </button>
                  )
                )}
              </div>
            </div>
          ) : actual === null && tema ? (
            <div key={`tema-${tema.key}`} className="editor-pane" data-testid="tema-edit">
              <header className="editor-q-head">
                <span className="editor-q-num tabular" aria-hidden>
                  T{indiceTema + 1}
                </span>
                <div className="grow">
                  <span className="eyebrow">
                    Tema {indiceTema + 1} de {temas.length}
                  </span>
                  <p className="xsmall muted" style={{ margin: "0.25rem 0 0" }}>
                    El alumno elige un único tema y responde solo sus preguntas.
                  </p>
                </div>
              </header>
              <Field id={`tema-nombre-${tema.key}`} label="Nombre" requerido error={errTema("nombre")} ayuda="Ej.: Tema 1">
                <input
                  ref={nombreTemaRef}
                  id={`tema-nombre-${tema.key}`}
                  className="input"
                  value={tema.nombre}
                  onChange={(e) => actualizarTema(tema.key, { nombre: e.target.value })}
                  maxLength={100}
                  aria-invalid={Boolean(errTema("nombre"))}
                />
              </Field>
              <Field id={`tema-titulo-${tema.key}`} label="Título" opcional error={errTema("titulo")}>
                <input
                  id={`tema-titulo-${tema.key}`}
                  className="input"
                  value={tema.titulo}
                  onChange={(e) => actualizarTema(tema.key, { titulo: e.target.value })}
                  maxLength={200}
                  placeholder="Ej.: Inteligencia Artificial"
                />
              </Field>
              <Field
                id={`tema-descripcion-${tema.key}`}
                label="Descripción"
                opcional
                error={errTema("descripcion")}
                ayuda="El alumno la lee al elegir el tema."
              >
                <textarea
                  id={`tema-descripcion-${tema.key}`}
                  className="textarea"
                  rows={3}
                  value={tema.descripcion}
                  onChange={(e) => actualizarTema(tema.key, { descripcion: e.target.value })}
                  placeholder="Ej.: Analizar aplicaciones de IA dentro de organizaciones."
                />
              </Field>
              <div className="editor-pane-foot">
                <span className="small muted">{plural(tema.consignas.length, "pregunta", "preguntas")} en este tema</span>
                {tema.consignas[0] ? (
                  <button type="button" className="btn btn-secondary" onClick={() => setSeleccion(tema.consignas[0].key)}>
                    Ir a las preguntas
                    <ArrowRight className="icon" aria-hidden />
                  </button>
                ) : (
                  <button type="button" className="btn btn-soft" onClick={() => setSelectorTipo({ modo: "nueva" })}>
                    <Plus className="icon" aria-hidden />
                    Agregar preguntas
                  </button>
                )}
              </div>
            </div>
          ) : actual ? (
            <div key={actual.key} className="editor-pane" data-testid="consigna-edit">
              <header className="editor-q-head">
                <span className="editor-q-num tabular" aria-hidden>
                  {num(indiceSel)}
                </span>
                <div className="grow">
                  <span className="eyebrow">
                    {porTemas && tema ? `${tema.nombre} · ` : ""}Pregunta {indiceSel + 1} de {consignas.length}
                  </span>
                  <div className="row" style={{ marginTop: "0.25rem" }}>
                    {(() => {
                      const { Icon, label } = TIPO_INFO[actual.tipo];
                      return (
                        <span className="badge badge-primary">
                          <Icon className="icon" aria-hidden />
                          {label}
                        </span>
                      );
                    })()}
                    <span className="xsmall muted">{TIPO_INFO[actual.tipo].correccion}</span>
                  </div>
                </div>
              </header>

              <Field id={`consigna-texto-${actual.key}`} label="Enunciado de la pregunta" requerido error={errDe(indiceSel, "texto")}>
                <textarea
                  ref={enunciadoPreguntaRef}
                  id={`consigna-texto-${actual.key}`}
                  className="textarea textarea-lg"
                  rows={4}
                  value={actual.texto}
                  onChange={(e) => actualizarConsigna(actual.key, { texto: e.target.value })}
                  aria-invalid={Boolean(errDe(indiceSel, "texto"))}
                  placeholder={
                    actual.tipo === "VERDADERO_FALSO"
                      ? "Escribí la afirmación que el alumno debe evaluar"
                      : actual.tipo === "DIAGRAMA"
                        ? "Ej.: Construí el árbol de decisión para determinar si un cliente accede al crédito"
                        : "Escribí la pregunta tal como la verá el alumno"
                  }
                />
              </Field>

              {actual.tipo === "OPCION_MULTIPLE" && (
                <div className="field">
                  <span className="label">
                    Opciones <span className="req">*</span>
                    <span className="label-optional">marcá la correcta</span>
                  </span>
                  <div className="option-editor">
                    {actual.opciones.map((o, j) => (
                      <div key={j} className={`option-row${actual.respuestaCorrecta === j ? " is-correct" : ""}`}>
                        <label className="option-radio" data-tooltip={actual.respuestaCorrecta === j ? "Correcta" : "Marcar como correcta"}>
                          <input
                            type="radio"
                            name={`correcta-${actual.key}`}
                            checked={actual.respuestaCorrecta === j}
                            onChange={() => actualizarConsigna(actual.key, { respuestaCorrecta: j })}
                            aria-label={`Marcar opción ${j + 1} como correcta`}
                          />
                          <span className="option-letter" data-letter={String.fromCharCode(65 + j)} aria-hidden />
                        </label>
                        <input
                          className="input"
                          value={o}
                          onChange={(e) => actualizarOpcion(actual.key, j, e.target.value)}
                          placeholder={`Opción ${j + 1}`}
                          aria-label={`Opción ${j + 1} de la pregunta ${indiceSel + 1}`}
                          aria-invalid={Boolean(errDe(indiceSel, `opciones.${j}`))}
                        />
                        <button type="button" className="icon-btn" onClick={() => eliminarOpcion(actual.key, j)} aria-label={`Eliminar opción ${j + 1}`}>
                          <X width={15} height={15} aria-hidden />
                        </button>
                      </div>
                    ))}
                  </div>
                  {actual.opciones.length < MAX_OPCIONES && (
                    <div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => actualizarConsigna(actual.key, { opciones: [...actual.opciones, ""] })}
                      >
                        <Plus className="icon" aria-hidden />
                        Agregar opción
                      </button>
                    </div>
                  )}
                  {(errDe(indiceSel, "opciones") ?? actual.opciones.map((_, j) => errDe(indiceSel, `opciones.${j}`)).find(Boolean)) && (
                    <FieldError
                      mensaje={(errDe(indiceSel, "opciones") ?? actual.opciones.map((_, j) => errDe(indiceSel, `opciones.${j}`)).find(Boolean))!}
                    />
                  )}
                  {errDe(indiceSel, "respuestaCorrecta") && <FieldError mensaje={errDe(indiceSel, "respuestaCorrecta")} />}
                </div>
              )}

              {actual.tipo === "VERDADERO_FALSO" && (
                <fieldset className="fieldset">
                  <legend className="label">
                    La afirmación es <span className="req">*</span>
                  </legend>
                  <div className="vf-choice">
                    {OPCIONES_VF.map((o, j) => (
                      <label key={o} className="choice">
                        <input
                          type="radio"
                          name={`vf-${actual.key}`}
                          checked={actual.respuestaCorrecta === j}
                          onChange={() => actualizarConsigna(actual.key, { respuestaCorrecta: j })}
                        />
                        <span className="choice-title">{o}</span>
                      </label>
                    ))}
                  </div>
                  {errDe(indiceSel, "respuestaCorrecta") && <FieldError mensaje={errDe(indiceSel, "respuestaCorrecta")} />}
                </fieldset>
              )}

              {actual.tipo === "DESARROLLO" && (
                <div className={`answer-preview${herramientas.habilitarEscritura ? "" : " is-warning"}`}>
                  <PenLine width={18} height={18} aria-hidden />
                  <div>
                    <strong>Respuesta escrita</strong>
                    <p>
                      {herramientas.habilitarEscritura
                        ? "El alumno responderá en un campo de texto libre."
                        : "La escritura está deshabilitada: el alumno no podrá escribir. Habilitala en Configuración del examen."}
                    </p>
                  </div>
                  {!herramientas.habilitarEscritura && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSeleccion("ajustes")}>
                      Ir a configuración
                    </button>
                  )}
                </div>
              )}

              {actual.tipo === "DIAGRAMA" && (
                <div className="answer-preview">
                  <svg width="72" height="48" viewBox="0 0 72 48" fill="none" aria-hidden className="answer-preview-art">
                    <path d="M36 12v8M36 20 16 34M36 20l20 14" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="36" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="8" y="34" width="16" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="48" y="34" width="16" height="10" rx="3" fill="currentColor" />
                  </svg>
                  <div>
                    <strong>Editor de árbol de decisión</strong>
                    <p>El alumno tendrá un lienzo con nodos, rectángulos, texto y conectores. Su respuesta se guarda como estructura, no como imagen.</p>
                  </div>
                </div>
              )}

              <div className="editor-pane-foot">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSeleccion(indiceSel === 0 ? (porTemas ? "tema" : "ajustes") : consignas[indiceSel - 1].key)}
                >
                  <ArrowLeft className="icon" aria-hidden />
                  {indiceSel === 0 ? (porTemas ? "Datos del tema" : "Configuración") : "Anterior"}
                </button>
                {indiceSel < consignas.length - 1 ? (
                  <button type="button" className="btn btn-secondary" onClick={() => setSeleccion(consignas[indiceSel + 1].key)}>
                    Siguiente pregunta
                    <ArrowRight className="icon" aria-hidden />
                  </button>
                ) : (
                  <button type="button" className="btn btn-soft" onClick={() => setSelectorTipo({ modo: "nueva" })}>
                    <Plus className="icon" aria-hidden />
                    Nueva pregunta
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </section>

        {/* ---------- Panel derecho: ajustes de la pregunta ---------- */}
        {actual && (
          <aside className="editor-aside" aria-label="Configuración de la pregunta">
            <h3 className="eyebrow">Configuración de la pregunta</h3>

            <div className="field">
              <span className="label">Tipo</span>
              <button type="button" className="type-current" onClick={() => setSelectorTipo({ modo: "cambiar", key: actual.key })}>
                {(() => {
                  const { Icon, label } = TIPO_INFO[actual.tipo];
                  return (
                    <>
                      <span className="type-current-icon">
                        <Icon width={16} height={16} aria-hidden />
                      </span>
                      <span className="grow">{label}</span>
                      <Repeat width={14} height={14} aria-hidden className="subtle" />
                      <span className="sr-only">Cambiar tipo</span>
                    </>
                  );
                })()}
              </button>
            </div>

            <Field
              id={`consigna-puntaje-${actual.key}`}
              label={`Puntaje (${PUNTAJE_MIN} a ${PUNTAJE_MAX})`}
              requerido
              error={errDe(indiceSel, "puntaje")}
            >
              <div className="score-field">
                <input
                  id={`consigna-puntaje-${actual.key}`}
                  className="input tabular"
                  type="number"
                  min={PUNTAJE_MIN}
                  max={PUNTAJE_MAX}
                  step="0.5"
                  value={actual.puntaje}
                  onChange={(e) => actualizarConsigna(actual.key, { puntaje: e.target.value })}
                  aria-invalid={Boolean(errDe(indiceSel, "puntaje"))}
                  placeholder="0"
                />
                <span className="score-suffix">pts</span>
              </div>
              <div className="chip-row" role="group" aria-label="Puntajes rápidos">
                {[1, 2, 5, 10].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`chip${actual.puntaje === String(p) ? " is-active" : ""}`}
                    onClick={() => actualizarConsigna(actual.key, { puntaje: String(p) })}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              id={`consigna-criterio-${actual.key}`}
              label="Respuesta esperada / criterio"
              opcional
              error={errDe(indiceSel, "criterio")}
              ayuda="Solo lo ves vos al corregir. Ayuda a mantener criterios consistentes."
            >
              <textarea
                id={`consigna-criterio-${actual.key}`}
                className="textarea"
                rows={4}
                value={actual.criterio}
                onChange={(e) => actualizarConsigna(actual.key, { criterio: e.target.value })}
                placeholder="Ej.: Debe identificar la condición raíz y dos hojas"
              />
            </Field>

            <div className="aside-note">
              <Lightbulb width={15} height={15} aria-hidden />
              <span>{TIPO_INFO[actual.tipo].descripcion}</span>
            </div>

            <div className="aside-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => duplicar(actual.key)}>
                <Copy className="icon" aria-hidden />
                Duplicar
              </button>
              <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => pedirEliminar(actual)}>
                <Trash2 className="icon" aria-hidden />
                Eliminar
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* ---------- Selector visual de tipo de pregunta ---------- */}
      <Modal
        abierto={selectorTipo !== null}
        titulo={selectorTipo?.modo === "cambiar" ? "Cambiar tipo de pregunta" : "¿Qué tipo de pregunta querés crear?"}
        descripcion={
          selectorTipo?.modo === "cambiar" ? "Al cambiar el tipo se reinician las opciones y la respuesta correcta." : "Elegí cómo va a responder el alumno."
        }
        tamanio="lg"
        onCerrar={() => setSelectorTipo(null)}
      >
        <div className="type-grid">
          {ORDEN_TIPOS.map((t) => {
            const { Icon, label, descripcion, correccion } = TIPO_INFO[t];
            const actualTipo = selectorTipo?.modo === "cambiar" && consignas.find((c) => c.key === selectorTipo.key)?.tipo === t;
            return (
              <button
                key={t}
                type="button"
                className={`type-card${actualTipo ? " is-current" : ""}`}
                onClick={() => {
                  if (selectorTipo?.modo === "cambiar") cambiarTipo(selectorTipo.key, t);
                  else agregarPregunta(t);
                  setSelectorTipo(null);
                }}
              >
                <span className="type-card-icon">
                  <Icon width={20} height={20} aria-hidden />
                </span>
                <span className="type-card-name">{label}</span>
                <span className="type-card-desc">{descripcion}</span>
                <span className="type-card-foot">{actualTipo ? "Tipo actual" : correccion}</span>
              </button>
            );
          })}
        </div>
        <div style={{ height: "1.25rem" }} />
      </Modal>

      {/* ---------- Vista previa de la elección de tema (lo que ve el alumno) ---------- */}
      <Modal
        abierto={vistaPrevia}
        titulo="Vista previa: elegí un tema"
        descripcion="Así ve el alumno los temas antes de comenzar. Una vez que empieza a responder no puede cambiarlo."
        icono={Eye}
        tamanio="lg"
        onCerrar={() => setVistaPrevia(false)}
      >
        <TemaCards
          temas={temas.map((t, i) => ({
            id: String(t.key),
            nombre: t.nombre || `Tema ${i + 1}`,
            titulo: t.titulo.trim() || null,
            descripcion: t.descripcion.trim() || null,
            preguntas: t.consignas.length,
          }))}
        />
      </Modal>

      <ConfirmModal
        abierto={aEliminar !== null}
        tono="danger"
        titulo="¿Eliminar esta pregunta?"
        mensaje="Se perderá su enunciado, opciones y criterio. Esta acción no se puede deshacer."
        textoConfirmar="Eliminar"
        onConfirmar={() => aEliminar !== null && eliminar(aEliminar)}
        onCancelar={() => setAEliminar(null)}
      />
      <ConfirmModal
        abierto={temaAEliminar !== null}
        tono="danger"
        titulo="¿Eliminar este tema?"
        mensaje="Se eliminarán el tema y todas sus preguntas. Esta acción no se puede deshacer."
        textoConfirmar="Eliminar tema"
        onConfirmar={() => temaAEliminar !== null && eliminarTema(temaAEliminar)}
        onCancelar={() => setTemaAEliminar(null)}
      />
      <ConfirmModal
        abierto={confirmarModoNormal}
        titulo="¿Pasar a examen normal?"
        mensaje="Los temas se eliminan y todas sus preguntas quedan juntas en una sola lista, que responderán todos los alumnos."
        textoConfirmar="Pasar a examen normal"
        onConfirmar={() => cambiarModo("NORMAL")}
        onCancelar={() => setConfirmarModoNormal(false)}
      />
    </form>
  );
}
