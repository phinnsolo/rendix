"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  CalendarDays,
  FileText,
  Layers,
  Pencil,
  Plus,
  Search,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import { ExamStatus } from "@/components/EstadoBadge";
import ClaseFormModal from "@/components/profesor/ClaseFormModal";
import EmptyState from "@/components/ui/EmptyState";
import { PageHeader, ProgressBar, UserAvatar } from "@/components/ui/Misc";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { estadoExamenUI } from "@/lib/estados";
import { formatFechaCorta, plural } from "@/lib/format";
import type { AlumnoGestion, ClaseDetalle, ClaseResumen } from "@/lib/services/clases";

interface Props {
  clase: ClaseDetalle;
  /** Todas las clases del profesor (destinos para "cambiar de clase"). */
  clases: ClaseResumen[];
  /** Alumnos que se pueden incorporar (sin clase, de otras clases propias o de otra cátedra). */
  alumnos: AlumnoGestion[];
}

type Alumno = ClaseDetalle["alumnos"][number];

async function pedir(url: string, init: RequestInit): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "No se pudo completar la operación" };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor" };
  }
}

export default function ClaseDetalleVista({ clase, clases, alumnos }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [aQuitar, setAQuitar] = useState<Alumno | null>(null);
  const [aMover, setAMover] = useState<Alumno | null>(null);
  const [procesando, setProcesando] = useState(false);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return clase.alumnos.filter((a) => !q || `${a.nombre} ${a.email}`.toLowerCase().includes(q));
  }, [clase.alumnos, busqueda]);

  const activos = clase.examenes.filter((e) => e.estado === "PUBLICADO");
  const borradores = clase.examenes.filter((e) => e.estado === "BORRADOR");

  async function quitar() {
    if (!aQuitar) return;
    setProcesando(true);
    const r = await pedir(`/api/profesor/clases/${clase.id}/alumnos/${aQuitar.id}`, { method: "DELETE" });
    setProcesando(false);
    if (!r.ok) return toast.error(r.error);
    toast.exito(`${aQuitar.nombre} ya no pertenece a ${clase.nombre}`);
    setAQuitar(null);
    router.refresh();
  }

  return (
    <div className="layout-wide-ish">
      <PageHeader
        volver={{ href: "/profesor/clases", label: "Clases" }}
        eyebrow="Clase"
        titulo={clase.nombre}
        subtitulo={clase.descripcion ?? undefined}
        acciones={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditando(true)}>
              <Pencil className="icon" aria-hidden />
              Editar
            </button>
            <button type="button" className="btn" onClick={() => setAgregando(true)}>
              <UserPlus className="icon" aria-hidden />
              Agregar alumno
            </button>
          </>
        }
      />

      <dl className="stat-strip stat-strip-3">
        <div>
          <dt>Alumnos</dt>
          <dd className="tabular">{clase.alumnos.length}</dd>
        </div>
        <div>
          <dt>Exámenes activos</dt>
          <dd className="tabular">{activos.length}</dd>
        </div>
        <div>
          <dt>Borradores</dt>
          <dd className="tabular">{borradores.length}</dd>
        </div>
      </dl>

      <div className="stack-lg">
        <section aria-labelledby="titulo-alumnos">
          <div className="section-head">
            <h2 className="section-title" id="titulo-alumnos">
              Alumnos <span className="count">{clase.alumnos.length}</span>
            </h2>
            {clase.alumnos.length > 0 && (
              <div className="input-group">
                <Search className="icon" aria-hidden />
                <input
                  type="search"
                  className="input input-sm"
                  placeholder="Buscar alumno..."
                  aria-label="Buscar alumno en la clase"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
            )}
          </div>
          {clase.alumnos.length === 0 ? (
            <EmptyState
              compacto
              icon={Users}
              titulo="La clase todavía no tiene alumnos"
              descripcion="Agregá a los alumnos de esta comisión: van a ver automáticamente los exámenes que le asignes a la clase."
              accion={
                <button type="button" className="btn" onClick={() => setAgregando(true)}>
                  <UserPlus className="icon" aria-hidden />
                  Agregar alumno
                </button>
              }
            />
          ) : visibles.length === 0 ? (
            <EmptyState compacto icon={Search} titulo="Sin resultados" descripcion="Ningún alumno de la clase coincide con la búsqueda." />
          ) : (
            <ul className="row-list" data-testid="alumnos-clase">
              {visibles.map((a) => (
                <li key={a.id}>
                  <div className="row-item">
                    <UserAvatar nombre={a.nombre} />
                    <div className="row-main">
                      <span className="row-title">{a.nombre}</span>
                      <div className="meta">
                        <span>{a.email}</span>
                        <span>En la clase desde {formatFechaCorta(a.desde, false)}</span>
                      </div>
                    </div>
                    <div className="row-actions">
                      {clases.length > 1 && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAMover(a)}>
                          <ArrowRightLeft className="icon" aria-hidden />
                          Cambiar de clase
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-danger-ghost btn-sm"
                        onClick={() => setAQuitar(a)}
                        aria-label={`Quitar a ${a.nombre} de la clase`}
                      >
                        <UserMinus className="icon" aria-hidden />
                        Quitar
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="titulo-examenes">
          <div className="section-head">
            <h2 className="section-title" id="titulo-examenes">
              Exámenes de la clase <span className="count">{clase.examenes.length}</span>
            </h2>
            <Link href={`/profesor/examenes/nuevo?clase=${clase.id}`} className="btn btn-ghost btn-sm">
              <Plus className="icon" aria-hidden />
              Crear examen para esta clase
            </Link>
          </div>
          {clase.examenes.length === 0 ? (
            <EmptyState compacto icon={FileText} titulo="Sin exámenes asignados" descripcion="Los exámenes que asignes a esta clase van a aparecer acá." />
          ) : (
            <ul className="row-list">
              {clase.examenes.map((e) => (
                <li key={e.id}>
                  <div className="row-item">
                    <div className="row-main">
                      <Link href={`/profesor/examenes/${e.id}`} className="row-title row-link">
                        {e.titulo}
                      </Link>
                      <div className="meta">
                        {e.modo === "POR_TEMAS" ? (
                          <span className="meta-item">
                            <Layers className="icon" aria-hidden />
                            Por temas · {plural(e.temas, "tema", "temas")}
                          </span>
                        ) : (
                          <span className="meta-item">{plural(e.preguntas, "pregunta", "preguntas")}</span>
                        )}
                        {e.fechaDisponible && (
                          <span className="meta-item">
                            <CalendarDays className="icon" aria-hidden />
                            {formatFechaCorta(e.fechaDisponible)}
                          </span>
                        )}
                        {e.duracionMinutos && <span>{e.duracionMinutos} min</span>}
                      </div>
                    </div>
                    {e.estado === "PUBLICADO" && (
                      <div className="exam-row-progress" style={{ minWidth: 140 }}>
                        <div className="row-between xsmall">
                          <span className="muted">Entregas</span>
                          <strong className="tabular">
                            {e.entregas}/{clase.alumnos.length}
                          </strong>
                        </div>
                        <ProgressBar valor={e.entregas} maximo={Math.max(clase.alumnos.length, 1)} etiqueta={`Entregas de ${e.titulo}`} tamanio="sm" />
                      </div>
                    )}
                    <ExamStatus
                      estado={estadoExamenUI({
                        estado: e.estado,
                        asignados: clase.alumnos.length,
                        entregas: e.entregas,
                        corregidas: e.corregidas,
                      })}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editando && <ClaseFormModal abierto clase={clase} onCerrar={() => setEditando(false)} />}
      {agregando && <AgregarAlumnoModal clase={clase} alumnos={alumnos} onCerrar={() => setAgregando(false)} />}
      {aMover && <MoverAlumnoModal alumno={aMover} clase={clase} clases={clases} onCerrar={() => setAMover(null)} />}
      <ConfirmModal
        abierto={aQuitar !== null}
        tono="danger"
        titulo={`¿Quitar a ${aQuitar?.nombre ?? ""} de la clase?`}
        mensaje="El alumno no se elimina y sus entregas anteriores se conservan, pero dejará de ver los exámenes de esta clase que todavía no entregó."
        textoConfirmar="Quitar de la clase"
        textoCargando="Quitando..."
        cargando={procesando}
        onConfirmar={quitar}
        onCancelar={() => setAQuitar(null)}
      />
    </div>
  );
}

/** Buscar y agregar alumnos. Si están en otra clase propia, agregarlos los cambia de clase. */
function AgregarAlumnoModal({ clase, alumnos, onCerrar }: { clase: ClaseDetalle; alumnos: AlumnoGestion[]; onCerrar: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agregados, setAgregados] = useState<string[]>([]);

  const candidatos = alumnos
    .filter((a) => a.clase?.id !== clase.id && !agregados.includes(a.id))
    .filter((a) => `${a.nombre} ${a.email}`.toLowerCase().includes(busqueda.trim().toLowerCase()))
    // Primero los que no tienen clase.
    .sort((a, b) => Number(Boolean(a.clase) || a.otraCatedra) - Number(Boolean(b.clase) || b.otraCatedra));

  async function agregar(a: AlumnoGestion) {
    setProcesando(a.id);
    setError(null);
    const r = await pedir(`/api/profesor/clases/${clase.id}/alumnos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alumnoId: a.id }),
    });
    setProcesando(null);
    if (!r.ok) return setError(r.error);
    setAgregados((xs) => [...xs, a.id]);
    toast.exito(a.clase ? `${a.nombre} pasó de ${a.clase.nombre} a ${clase.nombre}` : `${a.nombre} agregado a ${clase.nombre}`);
    router.refresh();
  }

  return (
    <Modal
      abierto
      titulo={`Agregar alumnos a ${clase.nombre}`}
      descripcion="Cada alumno pertenece a una sola clase. Si ya está en otra de tus clases, se lo cambia a esta (sus entregas anteriores se conservan)."
      icono={UserPlus}
      tamanio="lg"
      onCerrar={onCerrar}
      acciones={
        <button type="button" className="btn btn-secondary" onClick={onCerrar}>
          Listo
        </button>
      }
    >
      <div className="stack">
        <div className="input-group">
          <Search className="icon" aria-hidden />
          <input
            type="search"
            className="input input-sm"
            placeholder="Buscar por nombre o email..."
            aria-label="Buscar alumno para agregar"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            autoFocus
          />
        </div>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {candidatos.length === 0 ? (
          <p className="muted small italic">No hay alumnos para agregar{busqueda ? " que coincidan con la búsqueda" : ""}.</p>
        ) : (
          <ul className="row-list modal-scroll">
            {candidatos.map((a) => (
              <li key={a.id}>
                <div className="row-item">
                  <UserAvatar nombre={a.nombre} tamanio="sm" />
                  <div className="row-main">
                    <span className="row-title">{a.nombre}</span>
                    <div className="meta">
                      <span>{a.email}</span>
                      <span className={a.otraCatedra ? "subtle" : ""}>
                        {a.otraCatedra ? "En una clase de otro profesor" : a.clase ? `En ${a.clase.nombre}` : "Sin clase"}
                      </span>
                    </div>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className={`btn btn-sm ${a.clase ? "btn-secondary" : ""}`}
                      disabled={a.otraCatedra || procesando !== null}
                      onClick={() => agregar(a)}
                      aria-label={a.clase ? `Mover a ${a.nombre} a esta clase` : `Agregar a ${a.nombre}`}
                    >
                      {procesando === a.id && <span className="spinner" aria-hidden />}
                      {a.clase ? "Mover a esta clase" : "Agregar"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function MoverAlumnoModal({
  alumno,
  clase,
  clases,
  onCerrar,
}: {
  alumno: Alumno;
  clase: ClaseDetalle;
  clases: ClaseResumen[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const destinos = clases.filter((c) => c.id !== clase.id);
  const [destino, setDestino] = useState(destinos[0]?.id ?? "");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mover() {
    setProcesando(true);
    setError(null);
    const r = await pedir(`/api/profesor/clases/${destino}/alumnos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alumnoId: alumno.id }),
    });
    setProcesando(false);
    if (!r.ok) return setError(r.error);
    toast.exito(`${alumno.nombre} ahora pertenece a ${destinos.find((d) => d.id === destino)?.nombre}`);
    onCerrar();
    router.refresh();
  }

  return (
    <Modal
      abierto
      titulo={`Cambiar de clase a ${alumno.nombre}`}
      descripcion="Va a ver los exámenes de la nueva clase. Lo que ya entregó en esta clase se conserva, pero deja de ver los exámenes que todavía no entregó."
      icono={ArrowRightLeft}
      cerrable={!procesando}
      onCerrar={onCerrar}
      acciones={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCerrar} disabled={procesando}>
            Cancelar
          </button>
          <button type="button" className="btn" onClick={mover} disabled={procesando || !destino}>
            {procesando && <span className="spinner" aria-hidden />}
            {procesando ? "Moviendo..." : "Cambiar de clase"}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="label" htmlFor="destino-clase">
          Nueva clase
        </label>
        <select id="destino-clase" className="select" value={destino} onChange={(e) => setDestino(e.target.value)}>
          {destinos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({plural(c.alumnos, "alumno", "alumnos")})
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginTop: "0.75rem" }}>
          {error}
        </div>
      )}
    </Modal>
  );
}
