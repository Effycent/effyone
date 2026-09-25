-- =============================================================================
-- EffyOne · Fase 2.2 · Calendario de Liga (todos contra todos)
--   * Tabla de partidos (estructura del calendario: quién juega contra quién,
--     jornada, fecha y sede). NO guarda marcadores: los resultados y las tablas
--     se calcularán siempre desde los eventos (microfases 2.4 y Fase 3).
--   * generate_round_robin_fixture(): algoritmo del círculo (método de Berger)
--     con una o dos vueltas, descanso automático si el número de equipos es
--     impar, sorteo opcional y fechas espaciadas en la zona horaria del cliente.
--   * Bloqueo: si algún partido ya empezó o terminó, el calendario no se
--     puede regenerar (protege el historial).
--   * Todo va en funciones SQL atómicas y validadas: el cliente nunca escribe
--     partidos directamente.
-- =============================================================================

create type public.match_status as enum ('scheduled', 'in_progress', 'finished', 'canceled');

create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  stage_id      uuid not null references public.tournament_stages (id) on delete cascade,
  group_id      uuid references public.tournament_groups (id) on delete cascade,
  round_number  smallint not null,
  slot          smallint not null default 1,
  leg           smallint not null default 1,
  -- Sin "on delete": impide borrar una inscripción que ya tiene partidos, pero
  -- no estorba al borrar un torneo o cliente completo (se comprueba al final).
  home_entry_id uuid references public.tournament_entries (id),
  away_entry_id uuid references public.tournament_entries (id),
  scheduled_at  timestamptz,
  venue         text,
  status        public.match_status not null default 'scheduled',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint matches_round_positive check (round_number >= 1),
  constraint matches_leg_range check (leg in (1, 2)),
  constraint matches_distinct_sides check (
    home_entry_id is null or away_entry_id is null or home_entry_id <> away_entry_id
  ),
  constraint matches_venue_length check (venue is null or char_length(btrim(venue)) between 1 and 120)
);

comment on table public.matches is
  'Partido del calendario. Solo estructura y agenda; el marcador NO se guarda aquí, se calcula desde los eventos.';

create unique index matches_unique_pairing
  on public.matches (stage_id, leg, home_entry_id, away_entry_id)
  where home_entry_id is not null and away_entry_id is not null;
create index matches_stage_round_idx on public.matches (stage_id, round_number, slot);
create index matches_tournament_id_idx on public.matches (tournament_id);
create index matches_tenant_id_idx on public.matches (tenant_id);
create index matches_home_entry_idx on public.matches (home_entry_id);
create index matches_away_entry_idx on public.matches (away_entry_id);

create trigger matches_touch_updated_at
  before update on public.matches
  for each row execute function private.touch_updated_at();

-- La generación automática de calendarios ya funciona.
update public.feature_catalog
set availability = 'available', phase = 2
where feature_key = 'auto_fixtures';

-- ---------------------------------------------------------------------------
-- Comprobaciones comunes de las funciones de calendario
-- ---------------------------------------------------------------------------
create function private.assert_fixture_access(p_stage_id uuid)
returns public.tournament_stages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.tournament_stages%rowtype;
  v_tournament public.tournaments%rowtype;
begin
  select * into v_stage from public.tournament_stages where id = p_stage_id;
  if not found then
    raise exception 'Fase no encontrada.' using errcode = 'P0002';
  end if;
  select * into v_tournament from public.tournaments where id = v_stage.tournament_id;

  if v_tournament.tenant_id is distinct from private.current_tenant_id()
     or private.current_profile_role() is distinct from 'tenant_admin' then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if not private.tenant_can_write(v_tournament.tenant_id) then
    raise exception 'Tu cuenta está en solo lectura. Regulariza tu pago para modificar el calendario.'
      using errcode = 'check_violation';
  end if;
  if not private.feature_enabled(v_tournament.tenant_id, 'auto_fixtures') then
    raise exception 'Tu plan no incluye la generación automática de calendarios.'
      using errcode = 'check_violation';
  end if;
  if v_tournament.status in ('finished', 'archived') then
    raise exception 'No se puede modificar el calendario de un torneo finalizado o archivado.'
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_stage_id::text, 5));

  if exists (
    select 1 from public.matches m where m.stage_id = p_stage_id and m.status <> 'scheduled'
  ) then
    raise exception 'El calendario ya tiene partidos iniciados o finalizados; no se puede modificar.'
      using errcode = 'check_violation';
  end if;

  return v_stage;
end;
$$;

-- ---------------------------------------------------------------------------
-- Genera (o REGENERA) el calendario de una fase de Liga.
--   Método del círculo: con n equipos (se agrega un "descanso" si n es impar)
--   hay n-1 jornadas y en cada una todos juegan exactamente una vez.
--   Con dos vueltas, la segunda repite las jornadas invirtiendo la localía.
-- Devuelve la cantidad de partidos creados.
-- ---------------------------------------------------------------------------
create function public.generate_round_robin_fixture(
  p_stage_id uuid,
  p_first_date date default null,
  p_days_between_rounds integer default 7,
  p_kickoff_time time default '15:00',
  p_shuffle boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.tournament_stages%rowtype;
  v_tournament public.tournaments%rowtype;
  v_group_id uuid;
  v_timezone text;
  v_teams uuid[];
  v_n integer;
  v_m integer;
  v_round integer;
  v_i integer;
  v_a uuid;
  v_b uuid;
  v_home uuid;
  v_away uuid;
  v_slot integer;
  v_count integer := 0;
  v_when timestamptz;
begin
  v_stage := private.assert_fixture_access(p_stage_id);
  select * into v_tournament from public.tournaments where id = v_stage.tournament_id;

  if v_stage.format <> 'round_robin' then
    raise exception 'Esta función solo genera calendarios de Liga.' using errcode = 'check_violation';
  end if;
  if p_days_between_rounds is null or p_days_between_rounds not between 1 and 60 then
    raise exception 'Los días entre jornadas deben estar entre 1 y 60.' using errcode = 'check_violation';
  end if;

  select g.id into v_group_id
  from public.tournament_groups g
  where g.stage_id = p_stage_id
  order by g.group_order
  limit 1;
  if v_group_id is null then
    raise exception 'La fase no tiene grupo.' using errcode = 'check_violation';
  end if;

  select array_agg(e.id order by case when p_shuffle then random() else 0 end, e.created_at)
    into v_teams
  from public.tournament_entries e
  where e.tournament_id = v_tournament.id and e.status = 'registered';

  v_n := coalesce(array_length(v_teams, 1), 0);
  if v_n < 2 then
    raise exception 'Se necesitan al menos 2 equipos inscritos para generar el calendario.'
      using errcode = 'check_violation';
  end if;

  select t.timezone into v_timezone from public.tenants t where t.id = v_tournament.tenant_id;

  delete from public.matches where stage_id = p_stage_id;

  -- Número impar: se agrega un "descanso" (NULL) para completar la pareja.
  if v_n % 2 = 1 then
    v_teams := v_teams || array[null::uuid];
  end if;
  v_m := array_length(v_teams, 1);

  for v_round in 0 .. v_m - 2 loop
    v_slot := 0;
    v_when := null;
    if p_first_date is not null then
      v_when := ((p_first_date + v_round * p_days_between_rounds) + p_kickoff_time) at time zone v_timezone;
    end if;

    for v_i in 0 .. (v_m / 2) - 1 loop
      v_a := v_teams[v_i + 1];
      v_b := v_teams[v_m - v_i];
      continue when v_a is null or v_b is null; -- descanso

      -- Reparto de localía: el equipo fijo (posición 0) alterna por jornada y
      -- los demás según su posición. Con equipos pares, la diferencia entre
      -- partidos de local y de visita de cualquier equipo nunca pasa de 1.
      if (v_i = 0 and v_round % 2 = 0) or (v_i > 0 and v_i % 2 = 0) then
        v_home := v_a; v_away := v_b;
      else
        v_home := v_b; v_away := v_a;
      end if;

      v_slot := v_slot + 1;
      insert into public.matches
        (tenant_id, tournament_id, stage_id, group_id, round_number, slot, leg, home_entry_id, away_entry_id, scheduled_at)
      values
        (v_tournament.tenant_id, v_tournament.id, p_stage_id, v_group_id, v_round + 1, v_slot, 1, v_home, v_away, v_when);
      v_count := v_count + 1;

      if v_stage.round_robin_legs = 2 then
        insert into public.matches
          (tenant_id, tournament_id, stage_id, group_id, round_number, slot, leg, home_entry_id, away_entry_id, scheduled_at)
        values (
          v_tournament.tenant_id, v_tournament.id, p_stage_id, v_group_id,
          v_round + 1 + (v_m - 1), v_slot, 2, v_away, v_home,
          case when p_first_date is null then null
               else ((p_first_date + (v_round + v_m - 1) * p_days_between_rounds) + p_kickoff_time) at time zone v_timezone
          end
        );
        v_count := v_count + 1;
      end if;
    end loop;

    -- Rotación: el primero queda fijo y los demás giran una posición.
    v_teams := array[v_teams[1]] || array[v_teams[v_m]] || v_teams[2 : v_m - 1];
  end loop;

  return v_count;
end;
$$;

-- Borra el calendario completo de una fase (solo si nada ha empezado).
create function public.clear_stage_fixture(p_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_fixture_access(p_stage_id);
  delete from public.matches where stage_id = p_stage_id;
end;
$$;

-- Cambia fecha/hora y sede de un partido. La hora se recibe SIN zona horaria
-- y se interpreta en la zona horaria del cliente (null = sin fecha).
create function public.set_match_schedule(
  p_match_id uuid,
  p_local_time timestamp without time zone,
  p_venue text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_timezone text;
  v_venue text := nullif(btrim(coalesce(p_venue, '')), '');
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found then
    raise exception 'Partido no encontrado.' using errcode = 'P0002';
  end if;
  if v_match.tenant_id is distinct from private.current_tenant_id()
     or private.current_profile_role() is distinct from 'tenant_admin' then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if not private.tenant_can_write(v_match.tenant_id) then
    raise exception 'Tu cuenta está en solo lectura. Regulariza tu pago para modificar el calendario.'
      using errcode = 'check_violation';
  end if;
  if v_match.status <> 'scheduled' then
    raise exception 'Un partido iniciado o finalizado ya no se puede reprogramar.'
      using errcode = 'check_violation';
  end if;

  select t.timezone into v_timezone from public.tenants t where t.id = v_match.tenant_id;

  update public.matches
  set scheduled_at = case when p_local_time is null then null else p_local_time at time zone v_timezone end,
      venue = v_venue
  where id = p_match_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos y RLS
-- ---------------------------------------------------------------------------
revoke all on function private.assert_fixture_access(uuid) from public;
grant execute on function private.assert_fixture_access(uuid) to authenticated;

revoke all on function public.generate_round_robin_fixture(uuid, date, integer, time, boolean) from public, anon;
revoke all on function public.clear_stage_fixture(uuid) from public, anon;
revoke all on function public.set_match_schedule(uuid, timestamp without time zone, text) from public, anon;
grant execute on function public.generate_round_robin_fixture(uuid, date, integer, time, boolean) to authenticated;
grant execute on function public.clear_stage_fixture(uuid) to authenticated;
grant execute on function public.set_match_schedule(uuid, timestamp without time zone, text) to authenticated;

alter table public.matches enable row level security;
revoke all on public.matches from anon, authenticated;
-- Solo lectura por API: todas las escrituras pasan por las funciones de arriba.
grant select on public.matches to authenticated;

create policy matches_select on public.matches
  for select to authenticated
  using ((select private.is_super_admin()) or tenant_id = (select private.current_tenant_id()));
