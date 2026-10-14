import Link from "next/link";
import { CalendarDays, ChartColumn, CircleCheck, CircleDashed, ClipboardCheck, Clock, Layers, Pencil, TriangleAlert } from "lucide-react";
import { ExamStatus, HerramientasBadges } from "@/components/EstadoBadge";
import ClaseExamenEditor from "@/components/profesor/ClaseExamenEditor";
import EntregasExamen from "@/components/profesor/EntregasExamen";
import PublicarButton from "@/components/profesor/PublicarButton";
import QuestionCard from "@/components/profesor/QuestionCard";
import { PageHeader } from "@/components/ui/Misc";
import { FlashToast } from "@/components/ui/Toast";
import { estadoExamenUI } from "@/lib/estados";
import { formatFechaCorta, formatNumero, plural } from "@/lib/format";
import { cargarOFallar } from "@/lib/page-load";
import { requireRole } from "@/lib/session";
import { listarClasesProfesor } from "@/lib/services/clases";
import { listarEntregasExamen, obtenerExamenProfesor } from "@/lib/services/profesor";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string; publicado?: string }>;
}

export default async function ExamenProfesorPage({ params, searchParams }: Props) {
  const user = await requireRole("PROFESOR");
  const { id } = await params;
  const { guardado, publicado } = await searchParams;

  const examen = await cargarOFallar(() => obtenerExamenProfesor(user, id));
  const [entregas, clases] = await Promise.all([listarEntregasExamen(user, id), listarClasesProfesor(user)]);

  const esBorrador = examen.estado === "BORRADOR";
  const porTemas = examen.modo === "POR_TEMAS";
  const alumnosClase = examen.clase?._count.inscripciones ?? 0;
  const temas = examen.temas.map((t) => {
    const consignas = examen.consignas.filter((c) => c.temaId === t.id);
    return { ...t, consignas, puntaje: consignas.reduce((acc, c) => acc + c.puntaje, 0) };
  });
  const totalPuntaje = porTemas ? Math.max(0, ...temas.map((t) => t.puntaje)) : examen.consignas.reduce((acc, c) => acc + c.puntaje, 0);
  const entregados = entregas.filter((e) => e.entregado).length;
  const corregidos = entregas.filter((e) => e.estado === "CORREGIDO").length;
  const pendientes = entregas.filter((e) => e.estado === "ENTREGADO" || e.estado === "EN_CORRECCION");
  const conActividad = entregas.some((e) => e.estado !== null);
  const estadoUI = estadoExamenUI({ estado: examen.estado, asignados: alumnosClase, entregas: entregados, corregidas: corregidos });

  const checklist = [
    { ok: examen.titulo.trim().length > 0, texto: "Título y enunciado" },
    porTemas
      ? {
          ok: temas.length >= 2 && temas.every((t) => t.consignas.length > 0),
          texto: `${plural(temas.length, "tema", "temas")} con preguntas (mínimo 2)`,
        }
      : { ok: examen.consignas.length > 0, texto: plural(examen.consignas.length, "pregunta cargada", "preguntas cargadas") },
    { ok: examen.clase !== null, texto: examen.clase ? `Asignado a ${examen.clase.nombre}` : "Sin clase asignada" },
    ...(examen.clase && alumnosClase === 0 ? [{ ok: false, aviso: true, texto: "La clase todavía no tiene alumnos" }] : []),
  ];

  return (
    <div className="layout-wide-ish">
      {guardado && esBorrador && <FlashToast parametro="guardado" mensaje="Examen guardado como borrador" />}
      {publicado && !esBorrador && <FlashToast parametro="publicado" mensaje="Examen publicado: los alumnos de la clase ya pueden rendirlo" />}

      <PageHeader
        volver={{ href: "/profesor/examenes", label: "Exámenes" }}
        eyebrow={
          <span className="row" style={{ gap: "0.6rem" }}>
            <ExamStatus estado={estadoUI} />
            <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
              {examen.clase ? examen.clase.nombre : "Sin clase"}
              {porTemas && " · Por temas"}
              {examen.fechaPublicacion ? ` · Publicado ${formatFechaCorta(examen.fechaPublicacion)}` : ` · Creado ${formatFechaCorta(examen.fechaCreacion)}`}
            </span>
          </span>
        }
        titulo={examen.titulo}
        acciones={
          esBorrador ? (
            <>
              <Link className="btn btn-secondary" href={`/profesor/examenes/${examen.id}/editar`}>
                <Pencil className="icon" aria-hidden />
                Editar
              </Link>
              <PublicarButton
                examenId={examen.id}
                clase={examen.clase ? { nombre: examen.clase.nombre, alumnos: alumnosClase } : null}
              />
            </>
          ) : (
            <>
              <Link className="btn btn-secondary" href={`/profesor/resultados?examen=${examen.id}`}>
                <ChartColumn className="icon" aria-hidden />
                Resultados
              </Link>
              {pendientes[0]?.entregaId && (
                <Link className="btn" href={`/profesor/examenes/${examen.id}/entregas/${pendientes[0].entregaId}`}>
                  <ClipboardCheck className="icon" aria-hidden />
                  Corregir pendientes ({pendientes.length})
                </Link>
              )}
            </>
          )
        }
      />

      <dl className="stat-strip">
        <div>
          <dt>{porTemas ? "Temas" : "Preguntas"}</dt>
          <dd className="tabular">{porTemas ? temas.length : examen.consignas.length}</dd>
        </div>
        <div>
          <dt>{porTemas ? "Puntaje máx. por tema" : "Puntaje total"}</dt>
          <dd className="tabular">{formatNumero(totalPuntaje)}</dd>
        </div>
        <div>
          <dt>Alumnos de la clase</dt>
          <dd className="tabular">{alumnosClase}</dd>
        </div>
        <div>
          <dt>Entregas</dt>
          <dd className="tabular">
            {entregados}
            <small>/{alumnosClase}</small>
          </dd>
        </div>
        <div>
          <dt>Corregidas</dt>
          <dd className="tabular">
            {corregidos}
            <small>/{entregados}</small>
          </dd>
        </div>
      </dl>

      <div className="detail-grid">
        <div className="stack-lg">
          {!esBorrador && (
            <section id="entregas" className="anchor" aria-labelledby="titulo-entregas">
              <div className="section-head">
                <h2 className="section-title" id="titulo-entregas">
                  Entregas <span className="count">{entregados} de {alumnosClase}</span>
                </h2>
              </div>
              <EntregasExamen
                examenId={examen.id}
                filas={entregas}
                temas={examen.temas.map((t) => ({ id: t.id, nombre: t.nombre, titulo: t.titulo }))}
              />
            </section>
          )}

          {porTemas ? (
            <section aria-labelledby="titulo-temas">
              <div className="section-head">
                <h2 className="section-title" id="titulo-temas">
                  Temas <span className="count">{temas.length}</span>
                </h2>
                <span className="small muted">Cada alumno elige uno y responde solo sus preguntas</span>
              </div>
              <div className="stack-lg">
                {temas.map((t) => (
                  <section key={t.id} className="topic-block" aria-labelledby={`tema-${t.id}`}>
                    <header className="topic-block-head">
                      <span className="eyebrow">{t.nombre}</span>
                      <h3 id={`tema-${t.id}`} className="topic-block-title">
                        {t.titulo || t.nombre}
                      </h3>
                      {t.descripcion && <p className="small muted pre-wrap">{t.descripcion}</p>}
                      <span className="xsmall muted">
                        {plural(t.consignas.length, "pregunta", "preguntas")} · {formatNumero(t.puntaje)} puntos
                      </span>
                    </header>
                    <div className="qcard-list">
                      {t.consignas.map((c, i) => (
                        <QuestionCard
                          key={c.id}
                          orden={i + 1}
                          texto={c.texto}
                          tipo={c.tipo}
                          puntaje={c.puntaje}
                          opciones={c.opciones}
                          respuestaCorrecta={c.respuestaCorrecta}
                          criterio={c.criterio}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          ) : (
            <section aria-labelledby="titulo-preguntas">
              <div className="section-head">
                <h2 className="section-title" id="titulo-preguntas">
                  Preguntas <span className="count">{examen.consignas.length}</span>
                </h2>
                <span className="small muted">Total {formatNumero(totalPuntaje)} puntos</span>
              </div>
              <div className="qcard-list">
                {examen.consignas.map((c) => (
                  <QuestionCard
                    key={c.id}
                    orden={c.orden}
                    texto={c.texto}
                    tipo={c.tipo}
                    puntaje={c.puntaje}
                    opciones={c.opciones}
                    respuestaCorrecta={c.respuestaCorrecta}
                    criterio={c.criterio}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="stack detail-aside">
          {esBorrador && (
            <section className="card">
              <h3 className="section-title" style={{ marginBottom: "0.9rem" }}>
                Antes de publicar
              </h3>
              <ul className="checklist">
                {checklist.map((c) => (
                  <li key={c.texto} className={c.ok ? "is-ok" : "aviso" in c ? "is-warn" : ""}>
                    {c.ok ? (
                      <CircleCheck className="icon" aria-hidden />
                    ) : "aviso" in c ? (
                      <TriangleAlert className="icon" aria-hidden />
                    ) : (
                      <CircleDashed className="icon" aria-hidden />
                    )}
                    {c.texto}
                  </li>
                ))}
              </ul>
              <p className="small muted" style={{ margin: "0.9rem 0 0" }}>
                Mientras sea borrador, los alumnos no pueden verlo. Una vez publicado, las preguntas ya no se pueden editar.
              </p>
            </section>
          )}

          <section className="card">
            <h3 className="section-title" style={{ marginBottom: "0.75rem" }}>
              Clase
            </h3>
            <ClaseExamenEditor
              examenId={examen.id}
              clase={examen.clase ? { id: examen.clase.id, nombre: examen.clase.nombre, alumnos: alumnosClase } : null}
              clases={clases.map((c) => ({ id: c.id, nombre: c.nombre, alumnos: c.alumnos }))}
              bloqueada={conActividad}
            />
          </section>

          <section className="card">
            <h3 className="section-title" style={{ marginBottom: "0.75rem" }}>
              Instrucciones
            </h3>
            <p className="pre-wrap small" style={{ color: "var(--text-primary)" }}>
              {examen.enunciado}
            </p>
            <div className="stack-sm" style={{ marginTop: "0.9rem" }}>
              <span className="eyebrow">Modalidad</span>
              <span className="meta">
                <span className="meta-item">
                  <Layers className="icon" aria-hidden />
                  {porTemas ? "Por temas" : "Normal"}
                </span>
                <span className="meta-item">
                  <CalendarDays className="icon" aria-hidden />
                  {examen.fechaDisponible ? formatFechaCorta(examen.fechaDisponible) : "Disponible al publicar"}
                </span>
                <span className="meta-item">
                  <Clock className="icon" aria-hidden />
                  {examen.duracionMinutos ? `${examen.duracionMinutos} minutos` : "Sin límite de tiempo"}
                </span>
              </span>
              <span className="eyebrow">Herramientas</span>
              <HerramientasBadges
                escritura={examen.habilitarEscritura}
                calculadora={examen.habilitarCalculadora}
                geogebra={examen.habilitarGeoGebra}
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
