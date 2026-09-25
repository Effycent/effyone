-- =============================================================================
-- EffyOne · Fase 2.1 · Motor paramétrico base
--   * Catálogo de deportes (lo administra el Super Admin)
--   * Torneos con sus Parámetros de Decisión (puntuación, desempates,
--     disciplina) — agnóstico de deporte, nada de módulos por deporte.
--   * Una Fase (stage) inicial por torneo, en el formato elegido:
--     Liga (round_robin) o Eliminatoria directa (single_elimination).
--     El esquema ya admite varias fases por torneo (para Grupos+Eliminatoria
--     en una microfase posterior) sin rehacer nada.
--   * Equipos (del cliente, reutilizables entre torneos), inscripciones y
--     plantillas por torneo.
--   * Add-on "Servicio de estadísticas" asignado por torneo (Super Admin).
--   * Todos los límites de plan se validan en la base de datos, reutilizando
--     private.feature_enabled / private.feature_limit de la Fase 1B.
--   * Nada de esto escribe marcadores ni tablas de posiciones: eso llega en
--     las microfases 2.2–2.4, leyendo partidos y eventos que aún no existen.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.tournament_format as enum ('round_robin', 'single_elimination');
create type public.tournament_status as enum ('draft', 'scheduled', 'in_progress', 'finished', 'archived');
create type public.stage_status as enum ('draft', 'scheduled', 'in_progress', 'finished');
create type public.seeding_method as enum ('random', 'manual');
create type public.entry_status as enum ('registered', 'withdrawn');
create type public.tiebreaker_code as enum ('head_to_head', 'goal_diff', 'goals_for', 'wins', 'fewer_cards');

-- ---------------------------------------------------------------------------
-- sports: catálogo de deportes. Lo administra el Super Admin desde el
-- Backoffice. Cada torneo elige uno; el límite "tipos de deporte" del plan
-- cuenta deportes DISTINTOS entre los torneos no finalizados ni archivados
-- de ese cliente (se valida más abajo, en tournaments).
-- ---------------------------------------------------------------------------
create table public.sports (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sports_code_format check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint sports_name_length check (char_length(btrim(name)) between 2 and 60)
);

comment on table public.sports is
  'Catálogo de deportes. El sistema es agnóstico: no hay módulos por deporte, solo este catálogo y los Parámetros de Decisión de cada torneo.';

create trigger sports_touch_updated_at
  before update on public.sports
  for each row execute function private.touch_updated_at();

insert into public.sports (code, name) values
  ('futbol', 'Fútbol'),
  ('futbol_sala', 'Fútbol Sala');

-- Los torneos privados ya funcionan desde esta fase.
update public.feature_catalog
set availability = 'available', phase = 2
where feature_key = 'private_tournaments';

-- ---------------------------------------------------------------------------
-- tournaments
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  sport_id          uuid not null references public.sports (id) on delete restrict,
  name              text not null,
  status            public.tournament_status not null default 'draft',
  -- Público por defecto. Marcarlo privado (is_public = false) exige el plan.
  is_public         boolean not null default true,
  discipline_yellow_for_suspension  smallint,
  discipline_suspension_matches     smallint not null default 1,
  discipline_red_suspension_matches smallint not null default 1,
  discipline_cards_reset_between_stages boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz,

  constraint tournaments_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint tournaments_discipline_yellow check (
    discipline_yellow_for_suspension is null or discipline_yellow_for_suspension between 2 and 10
  ),
  constraint tournaments_discipline_suspension check (discipline_suspension_matches between 1 and 10),
  constraint tournaments_discipline_red_suspension check (discipline_red_suspension_matches between 1 and 10),
  constraint tournaments_archived_at check (
    (status = 'archived') = (archived_at is not null)
  )
);

comment on table public.tournaments is 'Un torneo de un cliente. Los Parámetros de Decisión de su formato viven en tournament_stages.';
comment on column public.tournaments.discipline_yellow_for_suspension is
  'Amarillas acumuladas que provocan sanción automática. NULL = sin sanción automática por acumulación (se define en Fase 3, aquí solo se guarda el parámetro).';
comment on column public.tournaments.discipline_cards_reset_between_stages is
  'true = las tarjetas acumuladas no viajan de una fase a la siguiente (ej. de grupos a eliminatoria).';

create index tournaments_tenant_id_idx on public.tournaments (tenant_id);
create index tournaments_sport_id_idx on public.tournaments (sport_id);

create trigger tournaments_touch_updated_at
  before update on public.tournaments
  for each row execute function private.touch_updated_at();

-- Valida "torneos activos" (scheduled/in_progress) y "tipos de deporte"
-- (deportes distintos entre torneos no finalizados ni archivados) contra el
-- plan del tenant. Solo bloquea lo que EXCEDE el límite al entrar en esos
-- estados; lo ya existente se conserva si el plan baja después.
create function private.enforce_tournament_plan_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
  v_was_active boolean;
  v_is_active boolean;
begin
  v_was_active := tg_op = 'UPDATE' and old.status in ('scheduled', 'in_progress');
  v_is_active := new.status in ('scheduled', 'in_progress');

  if v_is_active and not v_was_active then
    perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text, 1));
    v_limit := private.feature_limit(new.tenant_id, 'max_active_tournaments');
    if v_limit is not null then
      select count(*) into v_count
      from public.tournaments t
      where t.tenant_id = new.tenant_id
        and t.status in ('scheduled', 'in_progress')
        and t.id <> new.id;
      if v_count >= v_limit then
        raise exception
          'Tu plan permite % torneo(s) activo(s) a la vez. Finaliza uno o mejora tu plan.', v_limit
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or new.sport_id is distinct from old.sport_id then
    if not exists (
      select 1 from public.tournaments t
      where t.tenant_id = new.tenant_id
        and t.sport_id = new.sport_id
        and t.status not in ('finished', 'archived')
        and t.id <> new.id
    ) then
      perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text, 2));
      v_limit := private.feature_limit(new.tenant_id, 'max_sport_types');
      if v_limit is not null then
        select count(distinct t.sport_id) into v_count
        from public.tournaments t
        where t.tenant_id = new.tenant_id
          and t.status not in ('finished', 'archived')
          and t.id <> new.id;
        if v_count >= v_limit then
          raise exception
            'Tu plan permite % tipo(s) de deporte entre tus torneos activos. Finaliza o archiva un torneo de otro deporte, o mejora tu plan.', v_limit
            using errcode = 'check_violation';
        end if;
      end if;
    end if;
  end if;

  if new.is_public is distinct from true
     and (tg_op = 'INSERT' or old.is_public is distinct from new.is_public)
     and not private.feature_enabled(new.tenant_id, 'private_tournaments')
  then
    raise exception 'Tu plan no incluye marcar torneos como privados. Mejora tu plan para usar esta función.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger tournaments_enforce_plan_rules
  before insert or update of status, sport_id, is_public on public.tournaments
  for each row execute function private.enforce_tournament_plan_rules();

-- ---------------------------------------------------------------------------
-- tournament_stages: una fase dentro de un torneo. Por ahora, cada torneo
-- nace con UNA sola fase (en el formato elegido al crearlo). El esquema ya
-- admite varias fases ordenadas para cuando se sume Grupos + Eliminatoria.
-- ---------------------------------------------------------------------------
create table public.tournament_stages (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  stage_order    smallint not null default 1,
  name           text not null,
  format         public.tournament_format not null,
  status         public.stage_status not null default 'draft',

  -- Parámetros de Liga (round_robin). NULL si el formato es otro.
  round_robin_legs smallint,
  win_points       smallint,
  draw_points      smallint,
  loss_points      smallint,
  tie_breakers     public.tiebreaker_code[],

  -- Parámetros de Eliminatoria directa (single_elimination). NULL si el formato es otro.
  bracket_seeding      public.seeding_method,
  third_place_match    boolean,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tournament_stages_order unique (tournament_id, stage_order),
  constraint tournament_stages_name_length check (char_length(btrim(name)) between 2 and 80),
  constraint tournament_stages_round_robin_legs check (round_robin_legs is null or round_robin_legs in (1, 2)),
  constraint tournament_stages_points_range check (
    (win_points is null or win_points between 0 and 100)
    and (draw_points is null or draw_points between 0 and 100)
    and (loss_points is null or loss_points between 0 and 100)
  ),
  -- Cada familia de parámetros va completa o vacía, según el formato.
  constraint tournament_stages_round_robin_shape check (
    (format = 'round_robin'
      and round_robin_legs is not null and win_points is not null
      and draw_points is not null and loss_points is not null
      and bracket_seeding is null and third_place_match is null)
    or
    (format = 'single_elimination'
      and round_robin_legs is null and win_points is null
      and draw_points is null and loss_points is null and tie_breakers is null
      and bracket_seeding is not null and third_place_match is not null)
  )
);

comment on table public.tournament_stages is
  'Una fase de un torneo con su propio formato y Parámetros de Decisión. Varias fases por torneo llegan con Grupos + Eliminatoria.';
comment on column public.tournament_stages.tie_breakers is
  'Orden de criterios de desempate tras los puntos. Puede ir vacío: el empate queda pendiente de resolución manual.';

create index tournament_stages_tournament_id_idx on public.tournament_stages (tournament_id);

create trigger tournament_stages_touch_updated_at
  before update on public.tournament_stages
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- tournament_groups: grupos dentro de una fase de Liga. Toda fase round_robin
-- tiene al menos un grupo ("Grupo Único" si el administrador no divide en
-- zonas), para que partidos y tabla de posiciones siempre referencien un
-- grupo y no haya dos caminos de cálculo.
-- ---------------------------------------------------------------------------
create table public.tournament_groups (
  id          uuid primary key default gen_random_uuid(),
  stage_id    uuid not null references public.tournament_stages (id) on delete cascade,
  name        text not null default 'Grupo Único',
  group_order smallint not null default 1,
  created_at  timestamptz not null default now(),

  constraint tournament_groups_order unique (stage_id, group_order),
  constraint tournament_groups_name_length check (char_length(btrim(name)) between 1 and 60)
);

create index tournament_groups_stage_id_idx on public.tournament_groups (stage_id);

-- Solo las fases de Liga tienen grupos.
create function private.validate_group_stage_format()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tournament_stages s
    where s.id = new.stage_id and s.format = 'round_robin'
  ) then
    raise exception 'Solo las fases de Liga admiten grupos.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger tournament_groups_validate_format
  before insert or update on public.tournament_groups
  for each row execute function private.validate_group_stage_format();

-- Crea la fase (y su grupo, si es Liga) al crear el torneo, en un solo paso.
create function public.create_tournament(
  p_tenant_id uuid,
  p_sport_id uuid,
  p_name text,
  p_format public.tournament_format,
  p_is_public boolean default true,
  p_round_robin_legs smallint default 1,
  p_win_points smallint default 3,
  p_draw_points smallint default 1,
  p_loss_points smallint default 0,
  p_tie_breakers public.tiebreaker_code[] default array['head_to_head','goal_diff','goals_for','wins','fewer_cards']::public.tiebreaker_code[],
  p_bracket_seeding public.seeding_method default 'random',
  p_third_place_match boolean default false,
  p_discipline_yellow_for_suspension smallint default null,
  p_discipline_suspension_matches smallint default 1,
  p_discipline_red_suspension_matches smallint default 1,
  p_discipline_cards_reset_between_stages boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_stage_id uuid;
begin
  if p_tenant_id <> private.current_tenant_id() or private.current_profile_role() <> 'tenant_admin' then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if not private.tenant_can_write(p_tenant_id) then
    raise exception 'Tu cuenta está en solo lectura. Regulariza tu pago para crear torneos.'
      using errcode = 'check_violation';
  end if;

  insert into public.tournaments (
    tenant_id, sport_id, name, is_public,
    discipline_yellow_for_suspension, discipline_suspension_matches,
    discipline_red_suspension_matches, discipline_cards_reset_between_stages
  )
  values (
    p_tenant_id, p_sport_id, p_name, p_is_public,
    p_discipline_yellow_for_suspension, p_discipline_suspension_matches,
    p_discipline_red_suspension_matches, p_discipline_cards_reset_between_stages
  )
  returning id into v_tournament_id;

  if p_format = 'round_robin' then
    insert into public.tournament_stages (
      tournament_id, stage_order, name, format,
      round_robin_legs, win_points, draw_points, loss_points, tie_breakers
    )
    values (
      v_tournament_id, 1, 'Liga', 'round_robin',
      p_round_robin_legs, p_win_points, p_draw_points, p_loss_points, p_tie_breakers
    )
    returning id into v_stage_id;

    insert into public.tournament_groups (stage_id, name, group_order)
    values (v_stage_id, 'Grupo Único', 1);
  else
    insert into public.tournament_stages (
      tournament_id, stage_order, name, format, bracket_seeding, third_place_match
    )
    values (
      v_tournament_id, 1, 'Eliminatoria directa', 'single_elimination',
      p_bracket_seeding, p_third_place_match
    );
  end if;

  return v_tournament_id;
end;
$$;

revoke all on function public.create_tournament(
  uuid, uuid, text, public.tournament_format, boolean, smallint, smallint, smallint, smallint,
  public.tiebreaker_code[], public.seeding_method, boolean, smallint, smallint, smallint, boolean
) from public, anon;
grant execute on function public.create_tournament(
  uuid, uuid, text, public.tournament_format, boolean, smallint, smallint, smallint, smallint,
  public.tiebreaker_code[], public.seeding_method, boolean, smallint, smallint, smallint, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- teams: equipos del cliente (persisten entre torneos).
-- ---------------------------------------------------------------------------
create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  short_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teams_name_length check (char_length(btrim(name)) between 2 and 80),
  constraint teams_short_name_length check (short_name is null or char_length(btrim(short_name)) between 1 and 12)
);

comment on table public.teams is 'Equipo del cliente. Se inscribe en uno o más torneos mediante tournament_entries.';

create unique index teams_tenant_name_unique on public.teams (tenant_id, lower(name));
create index teams_tenant_id_idx on public.teams (tenant_id);

create trigger teams_touch_updated_at
  before update on public.teams
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- tournament_entries: inscripción de un equipo en un torneo.
-- ---------------------------------------------------------------------------
create table public.tournament_entries (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id       uuid not null references public.teams (id) on delete restrict,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  status        public.entry_status not null default 'registered',
  seed          smallint,
  created_at    timestamptz not null default now(),

  constraint tournament_entries_unique unique (tournament_id, team_id)
);

comment on table public.tournament_entries is 'Un equipo inscrito en un torneo. tenant_id va duplicado para políticas RLS simples y rápidas.';

create index tournament_entries_tournament_id_idx on public.tournament_entries (tournament_id);
create index tournament_entries_team_id_idx on public.tournament_entries (team_id);

-- El equipo y el torneo deben ser del MISMO cliente que tenant_id, y el
-- límite "equipos por torneo" del plan se valida aquí (solo al registrar).
create function private.enforce_entry_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
  v_tournament_tenant uuid;
  v_team_tenant uuid;
begin
  select tenant_id into v_tournament_tenant from public.tournaments where id = new.tournament_id;
  select tenant_id into v_team_tenant from public.teams where id = new.team_id;
  if v_tournament_tenant is null or v_team_tenant is null
     or v_tournament_tenant <> v_team_tenant or v_tournament_tenant <> new.tenant_id then
    raise exception 'El equipo y el torneo deben pertenecer al mismo cliente.' using errcode = 'check_violation';
  end if;

  if new.status = 'registered'
     and (tg_op = 'INSERT' or old.status <> 'registered') then
    perform pg_advisory_xact_lock(hashtextextended(new.tournament_id::text, 3));
    v_limit := private.feature_limit(new.tenant_id, 'max_teams_per_tournament');
    if v_limit is not null then
      select count(*) into v_count
      from public.tournament_entries e
      where e.tournament_id = new.tournament_id and e.status = 'registered' and e.id <> new.id;
      if v_count >= v_limit then
        raise exception
          'Tu plan permite % equipo(s) por torneo. Mejora tu plan para inscribir más.', v_limit
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger tournament_entries_enforce_rules
  before insert or update of status on public.tournament_entries
  for each row execute function private.enforce_entry_rules();

-- ---------------------------------------------------------------------------
-- roster_players: jugadores de la plantilla de un equipo EN UN TORNEO.
-- Sin identidad persistente entre torneos (decisión de negocio); el campo
-- document_id queda disponible por si en el futuro se quiere cruzar
-- jugadores entre torneos para control de sanciones, sin migrar nada.
-- ---------------------------------------------------------------------------
create table public.roster_players (
  id                  uuid primary key default gen_random_uuid(),
  tournament_entry_id uuid not null references public.tournament_entries (id) on delete cascade,
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  full_name           text not null,
  jersey_number       smallint,
  document_id         text,
  birth_date          date,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint roster_players_full_name_length check (char_length(btrim(full_name)) between 2 and 120),
  constraint roster_players_jersey_range check (jersey_number is null or jersey_number between 0 and 999),
  constraint roster_players_document_length check (document_id is null or char_length(btrim(document_id)) between 3 and 30)
);

comment on table public.roster_players is 'Jugador de la plantilla de un equipo en un torneo puntual (Fase 2, decisión de negocio: sin identidad entre torneos).';

create unique index roster_players_jersey_unique
  on public.roster_players (tournament_entry_id, jersey_number)
  where jersey_number is not null and is_active;
create index roster_players_entry_id_idx on public.roster_players (tournament_entry_id);
create index roster_players_tenant_id_idx on public.roster_players (tenant_id);

create trigger roster_players_touch_updated_at
  before update on public.roster_players
  for each row execute function private.touch_updated_at();

-- tenant_id debe coincidir con el de la inscripción; y el límite "jugadores
-- por torneo" del plan cuenta jugadores activos de TODO el torneo (todas
-- las plantillas juntas), solo al dar de alta o reactivar.
create function private.enforce_roster_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
  v_entry_tenant uuid;
  v_tournament_id uuid;
begin
  select tenant_id, tournament_id into v_entry_tenant, v_tournament_id
  from public.tournament_entries where id = new.tournament_entry_id;
  if v_entry_tenant is null or v_entry_tenant <> new.tenant_id then
    raise exception 'El jugador debe pertenecer al mismo cliente que su equipo.' using errcode = 'check_violation';
  end if;

  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    perform pg_advisory_xact_lock(hashtextextended(v_tournament_id::text, 4));
    v_limit := private.feature_limit(new.tenant_id, 'max_players_per_tournament');
    if v_limit is not null then
      select count(*) into v_count
      from public.roster_players p
      join public.tournament_entries e on e.id = p.tournament_entry_id
      where e.tournament_id = v_tournament_id and p.is_active and p.id <> new.id;
      if v_count >= v_limit then
        raise exception
          'Tu plan permite % jugador(es) por torneo. Mejora tu plan para sumar más.', v_limit
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger roster_players_enforce_rules
  before insert or update of is_active, tournament_entry_id on public.roster_players
  for each row execute function private.enforce_roster_rules();

-- ---------------------------------------------------------------------------
-- tournament_addons: asignación del add-on "Servicio de estadísticas" por
-- torneo. Servicio MANUAL (lo presta el equipo de EffyOne); el sistema solo
-- registra que está activo. Lo asigna exclusivamente el Super Admin.
-- ---------------------------------------------------------------------------
create table public.tournament_addons (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  addon_id       uuid not null references public.addons (id) on delete restrict,
  is_active      boolean not null default true,
  note           text,
  activated_at   timestamptz not null default now(),
  deactivated_at timestamptz,

  constraint tournament_addons_unique unique (tournament_id, addon_id),
  constraint tournament_addons_note_length check (note is null or char_length(note) <= 300),
  constraint tournament_addons_deactivated_at check ((not is_active) = (deactivated_at is not null))
);

comment on table public.tournament_addons is 'Add-ons asignados a un torneo. Hoy solo existe "stats_service"; lo activa el Super Admin manualmente.';

create index tournament_addons_tournament_id_idx on public.tournament_addons (tournament_id);

-- El add-on solo se puede asignar si el plan del cliente lo habilita
-- (columna addons.required_feature_key, definida en la Fase 1B).
create function private.enforce_addon_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_required_key text;
begin
  select t.tenant_id into v_tenant_id from public.tournaments t where t.id = new.tournament_id;
  select a.required_feature_key into v_required_key from public.addons a where a.id = new.addon_id;

  if v_required_key is not null and new.is_active
     and not private.feature_enabled(v_tenant_id, v_required_key) then
    raise exception 'El plan de este cliente no habilita ese add-on.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger tournament_addons_enforce_eligibility
  before insert or update on public.tournament_addons
  for each row execute function private.enforce_addon_eligibility();

-- ---------------------------------------------------------------------------
-- Vista de resumen para listados (torneo + deporte + formato + conteos)
-- ---------------------------------------------------------------------------
create view public.tournament_overview
with (security_invoker = true) as
select
  tr.id,
  tr.tenant_id,
  tr.name,
  tr.status,
  tr.is_public,
  tr.created_at,
  sp.code as sport_code,
  sp.name as sport_name,
  st.id as stage_id,
  st.format,
  (
    select count(*) from public.tournament_entries e
    where e.tournament_id = tr.id and e.status = 'registered'
  ) as teams_count,
  (
    select count(*) from public.roster_players p
    join public.tournament_entries e on e.id = p.tournament_entry_id
    where e.tournament_id = tr.id and p.is_active
  ) as players_count
from public.tournaments tr
join public.sports sp on sp.id = tr.sport_id
left join public.tournament_stages st on st.tournament_id = tr.id and st.stage_order = 1;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.sports enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_stages enable row level security;
alter table public.tournament_groups enable row level security;
alter table public.teams enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.roster_players enable row level security;
alter table public.tournament_addons enable row level security;

revoke all on public.sports from anon, authenticated;
revoke all on public.tournaments from anon, authenticated;
revoke all on public.tournament_stages from anon, authenticated;
revoke all on public.tournament_groups from anon, authenticated;
revoke all on public.teams from anon, authenticated;
revoke all on public.tournament_entries from anon, authenticated;
revoke all on public.roster_players from anon, authenticated;
revoke all on public.tournament_addons from anon, authenticated;
revoke all on public.tournament_overview from anon, authenticated;

-- sports: catálogo, lectura para toda sesión, escritura solo Super Admin.
grant select on public.sports to authenticated;
grant insert, update, delete on public.sports to authenticated;

create policy sports_select on public.sports for select to authenticated using (true);
create policy sports_write on public.sports
  for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

-- tournaments: mismo patrón que tenants (propio cliente o Super Admin de
-- soporte). Escritura de columnas de negocio solo por tenant_admin y solo si
-- el acceso permite escribir; el estado (status) también lo puede tocar el
-- Super Admin (archivar clientes suspendidos, soporte).
grant select on public.tournaments to authenticated;
grant update (name, is_public, status, archived_at,
  discipline_yellow_for_suspension, discipline_suspension_matches,
  discipline_red_suspension_matches, discipline_cards_reset_between_stages)
  on public.tournaments to authenticated;

create policy tournaments_select on public.tournaments
  for select to authenticated
  using ((select private.is_super_admin()) or tenant_id = (select private.current_tenant_id()));

create policy tournaments_update on public.tournaments
  for update to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and (select private.current_profile_role()) = 'tenant_admin'
    and (select private.tenant_can_write(tenant_id))
  )
  with check (
    tenant_id = (select private.current_tenant_id())
    and (select private.current_profile_role()) = 'tenant_admin'
    and (select private.tenant_can_write(tenant_id))
  );

-- tournament_stages / tournament_groups: solo lectura por API directa (la
-- creación va por create_tournament(); ediciones de parámetros llegan en
-- microfases posteriores, cuando exista UI para tocarlos sin romper fixtures).
grant select on public.tournament_stages to authenticated;
grant select on public.tournament_groups to authenticated;

create policy tournament_stages_select on public.tournament_stages
  for select to authenticated
  using (
    (select private.is_super_admin())
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_stages.tournament_id and t.tenant_id = (select private.current_tenant_id())
    )
  );

create policy tournament_groups_select on public.tournament_groups
  for select to authenticated
  using (
    (select private.is_super_admin())
    or exists (
      select 1 from public.tournament_stages s
      join public.tournaments t on t.id = s.tournament_id
      where s.id = tournament_groups.stage_id and t.tenant_id = (select private.current_tenant_id())
    )
  );

-- teams
grant select, insert, update, delete on public.teams to authenticated;

create policy teams_select on public.teams
  for select to authenticated
  using ((select private.is_super_admin()) or tenant_id = (select private.current_tenant_id()));

create policy teams_write on public.teams
  for all to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and (select private.current_profile_role()) = 'tenant_admin'
    and (select private.tenant_can_write(tenant_id))
  )
  with check (
    tenant_id = (select private.current_tenant_id())
    and (select private.current_profile_role()) = 'tenant_admin'
    and (select private.tenant_can_write(tenant_id))
  );

-- tournament_entries
grant select, insert, update, delete on public.tournament_entries to authenticated;

create policy tournament_entries_select on public.tournament_entries
  for select to authenticated
  using ((select private.is_super_admin()) or tenant_id = (select private.current_tenant_id()));

create policy tournament_entries_write on public.tournament_entries
  for all to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and (select private.current_profile_role()) = 'tenant_admin'
    and (select private.tenant_can_write(tenant_id))
  )
  with check (
    tenant_id = (select private.current_tenant_id())
    and (select private.current_profile_role()) = 'tenant_admin'
    and (select private.tenant_can_write(tenant_id))
  );

-- roster_players
grant select, insert, update, delete on public.roster_players to authenticated;

create policy roster_players_select on public.roster_players
  for select to authenticated
  using ((select private.is_super_admin()) or tenant_id = (select private.current_tenant_id()));

create policy roster_players_write on public.roster_players
  for all to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and (select private.current_profile_role()) = 'tenant_admin'
    and (select private.tenant_can_write(tenant_id))
  )
  with check (
    tenant_id = (select private.current_tenant_id())
    and (select private.current_profile_role()) = 'tenant_admin'
    and (select private.tenant_can_write(tenant_id))
  );

-- tournament_addons: el cliente solo lee (para mostrar "activo" en su
-- panel); solo el Super Admin escribe.
grant select on public.tournament_addons to authenticated;
grant insert, update, delete on public.tournament_addons to authenticated;

create policy tournament_addons_select on public.tournament_addons
  for select to authenticated
  using (
    (select private.is_super_admin())
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_addons.tournament_id and t.tenant_id = (select private.current_tenant_id())
    )
  );

create policy tournament_addons_write on public.tournament_addons
  for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

-- tournament_overview
grant select on public.tournament_overview to authenticated;
