-- Sprint final (5 y 6): corrección automática con agentes jueces, revisión docente, auditoría y publicación de notas.
-- Solo agrega columnas, estados, tablas e índices: no borra ni reescribe respuestas ni entregas. Es idempotente y la
-- aplica scripts/migrate.js (también scripts/seed.js).

-- --- Parcial: umbral de confianza para las alertas de revisión prioritaria (lo define el profesor)
alter table documentos add column if not exists umbral_confianza numeric(3, 2) not null default 0.70;

-- --- Entrega: estado de corrección, separado del estado de la sesión del examen (sesiones_examen.estado)
--   entregado → en-evaluacion → evaluado → publicado
-- `entregado`: respuestas persistidas y preguntas en cola; `en-evaluacion`: algún juez está corrigiendo;
-- `evaluado`: todas las preguntas tienen un resultado (de la IA, de error o pendiente de corrección manual);
-- `publicado`: el profesor publicó la nota y el alumno la puede ver.
alter table entregas add column if not exists estado_correccion text not null default 'entregado';
alter table entregas drop constraint if exists entregas_estado_correccion_check;
alter table entregas add constraint entregas_estado_correccion_check
  check (estado_correccion in ('entregado', 'en-evaluacion', 'evaluado', 'publicado'));
-- Nota total (escala 0 a 10) recalculada con los puntajes definitivos de cada pregunta.
alter table entregas add column if not exists nota numeric(5, 2);
alter table entregas add column if not exists fecha_publicacion timestamptz;
alter table entregas add column if not exists publicada_por text;
-- Copia del umbral del parcial al entregar (como la copia de los bloques): la entrega no cambia si el parcial cambia.
alter table entregas add column if not exists umbral_confianza numeric(3, 2) not null default 0.70;

-- Compatibilidad: las entregas que el profesor ya había corregido a mano (Sprints 1 a 3) ya eran visibles para el
-- alumno: quedan publicadas con esa nota. Solo se tocan las que todavía no tienen estado de corrección propio.
update entregas set estado_correccion = 'publicado', nota = (correccion ->> 'nota')::numeric,
  fecha_publicacion = coalesce((correccion ->> 'fecha')::timestamptz, fecha_entrega)
where correccion is not null and estado_correccion = 'entregado' and fecha_publicacion is null;

create index if not exists entregas_estado_correccion on entregas (estado_correccion);

-- --- Evaluación de cada pregunta de una entrega: cola persistente de los agentes jueces y resultado
-- Estados: pendiente (en cola) → procesando (tomada por un juez) → evaluada | error (fallaron los reintentos: pasa
-- a corrección manual) | manual (no corresponde IA, ej. GeoGebra) → revisada (la revisó el profesor).
create table if not exists evaluaciones (
  id uuid primary key default gen_random_uuid(),
  entrega_id text not null references entregas (id) on delete cascade,
  bloque_id text not null,
  orden integer not null,
  puntaje_max numeric(7, 2) not null check (puntaje_max > 0),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'procesando', 'evaluada', 'error', 'manual', 'revisada')),
  -- Cola: intentos hechos (máximo 3: el primero y 2 reintentos), cuándo puede volver a tomarse y cuándo se tomó.
  intentos integer not null default 0,
  disponible_desde timestamptz not null default now(),
  tomada_en timestamptz,
  ultimo_error text,
  -- Resultado del juez (sugerido) y valor definitivo (el sugerido, o el que puso el profesor).
  puntaje_sugerido numeric(7, 2),
  feedback_sugerido text,
  criterios jsonb not null default '[]',
  confianza numeric(4, 3),
  puntaje_final numeric(7, 2),
  feedback_final text,
  -- Alertas para el panel docente.
  respuesta_vacia boolean not null default false,
  baja_confianza boolean not null default false,
  requiere_revision boolean not null default false,
  -- Datos internos del juez (modelo, versión del prompt, salida validada). Nunca se mandan al alumno.
  juez jsonb,
  revisada_por text,
  fecha_revision timestamptz,
  fecha_evaluacion timestamptz,
  fecha_creacion timestamptz not null default now(),
  -- Una sola evaluación por pregunta de cada entrega: encolar dos veces no duplica nada.
  unique (entrega_id, bloque_id),
  check (puntaje_final is null or (puntaje_final >= 0 and puntaje_final <= puntaje_max)),
  check (puntaje_sugerido is null or (puntaje_sugerido >= 0 and puntaje_sugerido <= puntaje_max))
);
create index if not exists evaluaciones_cola on evaluaciones (disponible_desde) where estado = 'pendiente';
create index if not exists evaluaciones_procesando on evaluaciones (tomada_en) where estado = 'procesando';

-- --- Auditoría de calificaciones: cada cambio docente (puntaje, feedback) y cada publicación. Append-only.
create table if not exists auditoria_calificaciones (
  id uuid primary key default gen_random_uuid(),
  secuencia bigint generated always as identity,
  entrega_id text not null references entregas (id) on delete cascade,
  evaluacion_id uuid references evaluaciones (id) on delete cascade,
  bloque_id text,
  accion text not null check (accion in ('puntaje', 'feedback', 'publicacion', 'reevaluacion')),
  valor_anterior jsonb,
  valor_nuevo jsonb,
  actor text not null,
  fecha timestamptz not null default now()
);
create index if not exists auditoria_entrega on auditoria_calificaciones (entrega_id, fecha, secuencia);

-- Como los eventos de seguridad: no se modifican ni se borran (solo en cascada, si se borra el parcial).
create or replace function auditoria_calificaciones_inmutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' or pg_trigger_depth() <= 1 then
    raise exception 'La auditoría de calificaciones no se puede modificar ni borrar.' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists auditoria_calificaciones_inmutable on auditoria_calificaciones;
create trigger auditoria_calificaciones_inmutable before update or delete on auditoria_calificaciones
  for each row execute function auditoria_calificaciones_inmutable();
