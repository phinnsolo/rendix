-- El nombre de una clase no puede repetirse (US3), sin distinguir mayúsculas ni espacios de los extremos.
-- Si ya hay clases repetidas, la migración se detiene y las nombra: hay que renombrarlas a mano antes de aplicarla.
do $$
declare repetidos text;
begin
  select string_agg(format('"%s" (%s)', nombres, ids), '; ') into repetidos
  from (
    select string_agg(nombre, ' / ') as nombres, string_agg(id, ', ') as ids
    from clases group by lower(trim(nombre)) having count(*) > 1
  ) r;
  if repetidos is not null then
    raise exception 'Hay clases con el mismo nombre: %. Renombralas y volvé a correr la migración.', repetidos;
  end if;
end $$;

create unique index if not exists clases_nombre_unico on clases (lower(trim(nombre)));
