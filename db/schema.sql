-- Esquema de Rendix (PostgreSQL / Neon). Se aplica con scripts/seed.js; es idempotente.

create table if not exists usuarios (
  username text primary key,
  nombre text not null,
  email text unique,
  rol text not null check (rol in ('dev', 'profesor', 'alumno')),
  password_hash text not null,
  fecha_registro timestamptz not null default now()
);

-- Cada clase se dicta siempre el mismo día y turno. Las predefinidas (config.js) se cargan con el seed.
create table if not exists clases (
  id text primary key,
  nombre text not null,
  dia text not null,
  turno text not null,
  profesores text[] not null default '{}',
  alumnos text[] not null default '{}',
  predefinida boolean not null default false,
  fecha_creacion timestamptz not null default now(),
  fecha_modificacion timestamptz
);

create table if not exists documentos (
  id text primary key,
  profesor text not null references usuarios (username),
  clase_id text,
  estado text not null default 'borrador',
  titulo text not null,
  tema text not null default '',
  herramientas jsonb not null default '{}',
  duracion integer,
  bloques jsonb not null default '[]',
  contenido text not null default '',
  fecha_creacion timestamptz not null default now(),
  fecha_modificacion timestamptz not null default now(),
  fecha_publicacion timestamptz
);
create index if not exists documentos_profesor on documentos (profesor);

-- Un parcial programado en uno de los turnos. `inicio` y `fin` son los instantes absolutos de
-- fecha + hora (zona horaria fija de config.js); el servidor los compara con su propia hora.
create table if not exists turnos (
  id text primary key,
  profesor text not null references usuarios (username),
  parcial_id text not null references documentos (id) on delete cascade,
  turno text,
  nombre text,
  fecha date not null,
  hora_inicio text not null,
  hora_fin text not null,
  inicio timestamptz not null,
  fin timestamptz not null,
  alumnos text[] not null default '{}',
  fecha_creacion timestamptz not null default now()
);
create index if not exists turnos_parcial on turnos (parcial_id);
create index if not exists turnos_alumnos on turnos using gin (alumnos);

-- Un alumno resolviendo un parcial: apertura, hora límite, últimas respuestas guardadas y estado de
-- conexión. `seq` crece con cada cambio del alumno y descarta guardados que llegan fuera de orden.
create table if not exists sesiones_examen (
  turno_id text not null references turnos (id) on delete cascade,
  alumno text not null references usuarios (username),
  parcial_id text not null references documentos (id) on delete cascade,
  apertura timestamptz not null default now(),
  deadline timestamptz not null,
  respuestas jsonb not null default '{}',
  seq bigint not null default 0,
  ultimo_guardado timestamptz,
  ultimo_latido timestamptz not null default now(),
  pendientes boolean not null default false,
  estado text not null default 'en-curso' check (estado in ('en-curso', 'entregado', 'entregado-sistema')),
  primary key (turno_id, alumno)
);
create index if not exists sesiones_en_curso on sesiones_examen (deadline) where estado = 'en-curso';

-- Entrega con una copia del parcial: si el profesor lo edita después, la entrega no cambia.
create table if not exists entregas (
  id text primary key,
  parcial_id text not null references documentos (id) on delete cascade,
  profesor text not null references usuarios (username),
  alumno text not null references usuarios (username),
  alumno_nombre text not null,
  titulo text not null,
  tema text not null default '',
  herramientas jsonb not null default '{}',
  duracion integer,
  bloques jsonb not null default '[]',
  respuestas jsonb not null default '{}',
  fecha_inicio timestamptz,
  fecha_entrega timestamptz not null default now(),
  enviado_por_tiempo boolean not null default false,
  enviado_por_sistema boolean not null default false,
  correccion jsonb,
  unique (parcial_id, alumno)
);
create index if not exists entregas_profesor on entregas (profesor);
