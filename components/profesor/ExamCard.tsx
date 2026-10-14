"use client";

import Link from "next/link";
import {
  Award,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  Ellipsis,
  Eye,
  Layers,
  ListChecks,
  School,
  Pencil,
  Users,
} from "lucide-react";
import { ExamStatus } from "@/components/EstadoBadge";
import Dropdown, { type DropdownItem } from "@/components/ui/Dropdown";
import { ProgressBar } from "@/components/ui/Misc";
import { formatFechaCorta, formatNumero, plural } from "@/lib/format";
import type { ResumenExamen } from "@/lib/services/panel";

/** Fila interactiva de examen: todo lo importante de un vistazo y las acciones a un click. */
export default function ExamCard({ examen: e }: { examen: ResumenExamen }) {
  const href = `/profesor/examenes/${e.id}`;
  const borrador = e.estado === "BORRADOR";

  const menu: DropdownItem[] = [
    { label: "Ver examen", href, icon: Eye },
    ...(borrador ? [{ label: "Editar", href: `${href}/editar`, icon: Pencil }] : []),
    ...(!borrador
      ? [
          { label: "Ver entregas", href: `${href}#entregas`, icon: ClipboardCheck },
          { label: "Resultados", href: `/profesor/resultados?examen=${e.id}`, icon: ChartColumn },
        ]
      : []),
  ];

  return (
    <div className="row-item exam-row" data-testid="exam-card">
      <div className="exam-row-glyph" aria-hidden data-estado={e.estadoUI}>
        <span>{String(e.preguntas).padStart(2, "0")}</span>
        <small>preg.</small>
      </div>

      <div className="row-main">
        <div className="row" style={{ gap: "0.6rem" }}>
          <Link href={href} className="row-title row-link">
            <span className="truncate">{e.titulo}</span>
          </Link>
          <ExamStatus estado={e.estadoUI} />
        </div>
        <div className="meta">
          <span className="meta-item">
            <CalendarDays className="icon" aria-hidden />
            {borrador ? `Creado ${formatFechaCorta(e.fechaCreacion)}` : `Publicado ${formatFechaCorta(e.fechaPublicacion)}`}
          </span>
          <span className="meta-item">
            <School className="icon" aria-hidden />
            {e.clase ? e.clase.nombre : "Sin clase"}
          </span>
          <span className="meta-item">
            <Users className="icon" aria-hidden />
            {plural(e.asignados, "alumno", "alumnos")}
          </span>
          {e.modo === "POR_TEMAS" ? (
            <span className="meta-item">
              <Layers className="icon" aria-hidden />
              {plural(e.temas, "tema", "temas")}
            </span>
          ) : (
            <span className="meta-item">
              <ListChecks className="icon" aria-hidden />
              {plural(e.preguntas, "pregunta", "preguntas")}
            </span>
          )}
          <span className="meta-item">
            <Award className="icon" aria-hidden />
            {formatNumero(e.puntajeMaximo)} pts
          </span>
        </div>
      </div>

      {!borrador && (
        <div className="row-stats exam-row-stats">
          <div className="exam-row-progress">
            <div className="row-between xsmall">
              <span className="muted">Entregas</span>
              <strong className="tabular">
                {e.entregas}/{e.asignados}
              </strong>
            </div>
            <ProgressBar valor={e.entregas} maximo={Math.max(e.asignados, 1)} etiqueta={`Entregas de ${e.titulo}`} tamanio="sm" />
          </div>
          <div className="row-stat">
            <strong>{e.promedio !== null ? formatNumero(e.promedio) : "—"}</strong>
            <span>{e.promedioSobre10 ? "promedio /10" : "promedio"}</span>
          </div>
        </div>
      )}

      <div className="row-actions">
        {borrador ? (
          <Link href={`${href}/editar`} className="btn btn-secondary btn-sm">
            <Pencil className="icon" aria-hidden />
            Editar
          </Link>
        ) : e.pendientes > 0 ? (
          <Link href={`${href}#entregas`} className="btn btn-soft btn-sm">
            <ClipboardCheck className="icon" aria-hidden />
            Corregir ({e.pendientes})
          </Link>
        ) : (
          <Link href={`/profesor/resultados?examen=${e.id}`} className="btn btn-secondary btn-sm">
            <ChartColumn className="icon" aria-hidden />
            Resultados
          </Link>
        )}
        <Dropdown trigger={<Ellipsis className="icon" aria-hidden />} triggerLabel={`Más acciones para ${e.titulo}`} items={menu} />
      </div>
    </div>
  );
}
