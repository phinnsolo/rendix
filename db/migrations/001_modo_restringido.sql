-- Sprint 4: modo restringido y trazabilidad de exámenes.
-- Solo agrega columnas, estados, una tabla e índices: no borra ni reescribe datos existentes. Es idempotente
-- (se puede correr más de una vez) y la aplica scripts/migrate.js (también scripts/seed.js).

-- --- Sesión del examen (ExamSession): estados nuevos y datos del modo restringido

-- Identificador propio de la sesión, para referenciarla desde los eventos. Las filas existentes reciben uno nuevo.
alter table sesiones_examen add column if not exists id uuid not null default gen_random_uuid();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sesiones_examen_id_key') then
    alter table sesiones_examen add constraint sesiones_examen_id_key unique (id);
  end if;
end $$;

-- Estados: en-curso → entregado | entregado-sistema (por tiempo) | salio-entrego (SALIR) | incidente;
-- incidente → en-curso (lo reanuda el profesor). Las transiciones están en src/estadoExamen.js.
alter table sesiones_examen drop constraint if exists sesiones_examen_estado_check;
alter table sesiones_examen add constraint sesiones_examen_estado_check
  check (estado in ('en-curso', 'entregado', 'entregado-sistema', 'salio-entrego', 'incidente'));

-- Cuándo aceptó las reglas del modo restringido (hora del servidor).
alter table sesiones_examen add column if not exists reglas_aceptadas timestamptz;
-- Tiempo que le quedaba al alumno cuando se produjo el incidente: al reanudar sigue con ese tiempo.
alter table sesiones_examen add column if not exists restante_ms bigint;
alter table sesiones_examen add column if not exists incidente_fecha timestamptz;
alter table sesiones_examen add column if not exists incidente_causa text;
-- El profesor reanudó la sesión y el alumno todavía no volvió a pantalla completa: el tiempo está detenido.
alter table sesiones_examen add column if not exists reingreso_pendiente boolean not null default false;
alter table sesiones_examen add column if not exists reanudaciones integer not null default 0;
-- Fin de la sesión (entrega, salida voluntaria o entrega del sistema).
alter table sesiones_examen add column if not exists fecha_fin timestamptz;
alter table sesiones_examen add column if not exists fecha_modificacion timestamptz not null default now();

-- Para encontrar rápido las sesiones activas sin latido (normalización por heartbeat) y las de un estado.
create index if not exists sesiones_latido_en_curso on sesiones_examen (ultimo_latido) where estado = 'en-curso';
create index if not exists sesiones_estado on sesiones_examen (estado);
create index if not exists sesiones_parcial on sesiones_examen (parcial_id);
create index if not exists sesiones_alumno on sesiones_examen (alumno);

-- Entrega hecha con el botón SALIR (se ve como "Salió y se entregó", distinta de una entrega normal).
alter table entregas add column if not exists salida_voluntaria boolean not null default false;

-- --- Trazabilidad: eventos de seguridad, append-only

create table if not exists eventos_seguridad (
  id uuid primary key default gen_random_uuid(),
  -- Orden estable entre eventos con la misma hora del servidor (los de una misma transacción).
  secuencia bigint generated always as identity,
  sesion_id uuid not null references sesiones_examen (id) on delete cascade,
  turno_id text not null,
  parcial_id text not null,
  alumno text not null,
  tipo text not null check (tipo in (
    'EXAM_STARTED', 'RESTRICTED_MODE_ACCEPTED', 'FULLSCREEN_ENTERED', 'FULLSCREEN_EXIT', 'VISIBILITY_HIDDEN',
    'WINDOW_BLUR', 'PAGE_EXIT', 'PAGE_RELOAD', 'NAVIGATION', 'CONNECTION_LOST', 'HEARTBEAT_TIMEOUT', 'INCIDENT',
    'VOLUNTARY_EXIT', 'NORMAL_SUBMISSION', 'TIME_EXPIRED', 'RESUMED_BY_TEACHER', 'RECONNECTED'
  )),
  -- Hora oficial (servidor). La del dispositivo del alumno es solo diagnóstico.
  fecha_servidor timestamptz not null default now(),
  fecha_cliente timestamptz,
  -- Quién lo produjo: el username del alumno o del profesor, o 'sistema'.
  actor text not null,
  -- Clave generada por el cliente (o derivada por el servidor) para que un reintento no duplique el evento.
  clave_idempotencia text,
  metadata jsonb not null default '{}',
  fecha_creacion timestamptz not null default now(),
  unique (sesion_id, clave_idempotencia)
);
create index if not exists eventos_sesion on eventos_seguridad (sesion_id, fecha_servidor, secuencia);
create index if not exists eventos_parcial on eventos_seguridad (parcial_id);
create index if not exists eventos_alumno on eventos_seguridad (alumno);
create index if not exists eventos_tipo on eventos_seguridad (tipo);
create index if not exists eventos_fecha on eventos_seguridad (fecha_servidor);

-- Los eventos no se modifican ni se borran. Solo desaparecen en cascada si se borra el parcial (y con él el
-- turno y la sesión): en ese caso el borrado viene de la clave foránea, con pg_trigger_depth() > 1.
create or replace function eventos_seguridad_inmutables() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' or pg_trigger_depth() <= 1 then
    raise exception 'Los eventos de seguridad no se pueden modificar ni borrar.' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists eventos_seguridad_inmutables on eventos_seguridad;
create trigger eventos_seguridad_inmutables before update or delete on eventos_seguridad
  for each row execute function eventos_seguridad_inmutables();
