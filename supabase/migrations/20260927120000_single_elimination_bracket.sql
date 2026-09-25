-- =============================================================================
-- EffyOne · Fase 2.3 · Llave de Eliminatoria directa
--   * La llave se guarda como ESTRUCTURA: cada partido de una ronda posterior
--     indica de dónde viene cada lado ("ganador/perdedor del partido X"). NO se
--     guarda quién avanzó: eso se calculará siempre desde los resultados
--     (eventos), igual que los marcadores y las tablas.
--   * Los equipos que pasan directo (byes, cuando el número de equipos no es
--     potencia de 2) quedan ubicados desde el inicio en la ronda 2.
--   * Sorteo aleatorio (siembra estándar: los mejores puestos reciben los byes y
--     no se cruzan hasta el final) o cruces armados a mano por el administrador.
--   * Tercer puesto opcional (perdedores de las semifinales).
-- =============================================================================

alter table public.matches
  add column home_source_match_id uuid references public.matches (id),
  add column home_source_kind text,
  add column away_source_match_id uuid references public.matches (id),
  add column away_source_kind text,
  add column is_third_place boolean not null default false;

alter table public.matches
  add constraint matches_home_source_kind check (
    (home_source_match_id is null) = (home_source_kind is null)
    and (home_source_kind is null or home_source_kind in ('winner', 'loser'))
  ),
  add constraint matches_away_source_kind check (
    (away_source_match_id is null) = (away_source_kind is null)
    and (away_source_kind is null or away_source_kind in ('winner', 'loser'))
  ),
  -- Cada lado es un equipo concreto O viene de otro partido, nunca ambos ni ninguno.
  add constraint matches_home_defined check ((home_entry_id is null) <> (home_source_match_id is null)),
  add constraint matches_away_defined check ((away_entry_id is null) <> (away_source_match_id is null));

comment on column public.matches.home_source_match_id is
  'Llaves: el lado local sale del ganador/perdedor de este partido (se resuelve desde los resultados, no se guarda).';

create index matches_home_source_idx on public.matches (home_source_match_id);
create index matches_away_source_idx on public.matches (away_source_match_id);

-- Inserta un partido de llave (auxiliar).
create function private.insert_bracket_match(
  p_stage public.tournament_stages,
  p_tenant_id uuid,
  p_round integer,
  p_slot integer,
  p_home_entry uuid,
  p_home_source uuid,
  p_away_entry uuid,
  p_away_source uuid,
  p_when timestamptz,
  p_third boolean default false,
  p_home_kind text default 'winner',
  p_away_kind text default 'winner'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.matches (
    tenant_id, tournament_id, stage_id, group_id, round_number, slot, leg,
    home_entry_id, home_source_match_id, home_source_kind,
    away_entry_id, away_source_match_id, away_source_kind,
    scheduled_at, is_third_place
  )
  values (
    p_tenant_id, p_stage.tournament_id, p_stage.id, null, p_round, p_slot, 1,
    p_home_entry, p_home_source, case when p_home_source is null then null else p_home_kind end,
    p_away_entry, p_away_source, case when p_away_source is null then null else p_away_kind end,
    p_when, p_third
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Genera (o REGENERA) la llave de una fase de Eliminatoria directa.
--   p_seeding = 'random'  → sorteo con siembra estándar
--   p_seeding = 'manual'  → p_manual_slots trae las posiciones de la primera
--                           ronda, de arriba hacia abajo: los cruces son
--                           (1,2), (3,4)... y NULL = lugar libre (pasa directo).
--   NULL en p_seeding / p_third_place usa lo definido en la fase.
-- Devuelve la cantidad de partidos creados.
-- ---------------------------------------------------------------------------
create function public.generate_single_elimination_bracket(
  p_stage_id uuid,
  p_first_date date default null,
  p_days_between_rounds integer default 7,
  p_kickoff_time time default '15:00',
  p_seeding public.seeding_method default null,
  p_manual_slots uuid[] default null,
  p_third_place boolean default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.tournament_stages%rowtype;
  v_tournament public.tournaments%rowtype;
  v_seeding public.seeding_method;
  v_third boolean;
  v_timezone text;
  v_teams uuid[];
  v_shuffled uuid[];
  v_slots uuid[];
  v_order integer[];
  v_next_order integer[];
  v_x integer;
  v_n integer;
  v_size integer;
  v_rounds integer;
  v_round integer;
  v_k integer;
  v_len integer;
  v_a uuid;
  v_b uuid;
  v_id uuid;
  v_count integer := 0;
  v_cur_entry uuid[];
  v_cur_match uuid[];
  v_new_entry uuid[];
  v_new_match uuid[];
  v_prev_match uuid[];
  v_when timestamptz;
  v_id_slot uuid;
begin
  v_stage := private.assert_fixture_access(p_stage_id);
  select * into v_tournament from public.tournaments where id = v_stage.tournament_id;

  if v_stage.format <> 'single_elimination' then
    raise exception 'Esta función solo genera llaves de Eliminatoria directa.' using errcode = 'check_violation';
  end if;
  if p_days_between_rounds is null or p_days_between_rounds not between 1 and 60 then
    raise exception 'Los días entre rondas deben estar entre 1 y 60.' using errcode = 'check_violation';
  end if;

  v_seeding := coalesce(p_seeding, v_stage.bracket_seeding);
  v_third := coalesce(p_third_place, v_stage.third_place_match);

  select array_agg(e.id order by e.created_at) into v_teams
  from public.tournament_entries e
  where e.tournament_id = v_tournament.id and e.status = 'registered';
  v_n := coalesce(array_length(v_teams, 1), 0);
  if v_n < 2 then
    raise exception 'Se necesitan al menos 2 equipos inscritos para generar la llave.'
      using errcode = 'check_violation';
  end if;

  v_size := 2;
  v_rounds := 1;
  while v_size < v_n loop
    v_size := v_size * 2;
    v_rounds := v_rounds + 1;
  end loop;

  if v_seeding = 'manual' then
    if p_manual_slots is null or coalesce(array_length(p_manual_slots, 1), 0) <> v_size then
      raise exception 'Para armar los cruces a mano hay que indicar las % posiciones de la primera ronda.', v_size
        using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from unnest(p_manual_slots) s where s is not null and not (s = any (v_teams))
    ) then
      raise exception 'Uno de los equipos elegidos no está inscrito en el torneo.' using errcode = 'check_violation';
    end if;
    if (select count(s) from unnest(p_manual_slots) s) <> v_n
       or (select count(distinct s) from unnest(p_manual_slots) s) <> v_n then
      raise exception 'Cada equipo inscrito debe aparecer exactamente una vez en los cruces.'
        using errcode = 'check_violation';
    end if;
    for v_k in 1 .. v_size / 2 loop
      if p_manual_slots[2 * v_k - 1] is null and p_manual_slots[2 * v_k] is null then
        raise exception 'El cruce % no tiene ningún equipo.', v_k using errcode = 'check_violation';
      end if;
    end loop;
    v_slots := p_manual_slots;
  else
    -- Sorteo: se reparten las semillas al azar y se colocan con la siembra
    -- estándar (1 vs último, 2 vs penúltimo...): los byes van a las primeras
    -- semillas y los mejores puestos no se cruzan hasta el final.
    select array_agg(t order by random()) into v_shuffled from unnest(v_teams) t;
    v_order := array[1];
    while array_length(v_order, 1) < v_size loop
      v_next_order := '{}';
      v_len := array_length(v_order, 1);
      foreach v_x in array v_order loop
        v_next_order := v_next_order || v_x || (2 * v_len + 1 - v_x);
      end loop;
      v_order := v_next_order;
    end loop;
    v_slots := array_fill(null::uuid, array[v_size]);
    for v_k in 1 .. v_size loop
      if v_order[v_k] <= v_n then
        v_slots[v_k] := v_shuffled[v_order[v_k]];
      end if;
    end loop;
  end if;

  select t.timezone into v_timezone from public.tenants t where t.id = v_tournament.tenant_id;

  delete from public.matches where stage_id = p_stage_id;

  -- Ronda 1: los cruces reales se crean; quien enfrenta un lugar libre pasa directo.
  v_cur_entry := array_fill(null::uuid, array[v_size / 2]);
  v_cur_match := array_fill(null::uuid, array[v_size / 2]);
  v_when := case when p_first_date is null then null
                 else (p_first_date + p_kickoff_time) at time zone v_timezone end;
  for v_k in 1 .. v_size / 2 loop
    v_a := v_slots[2 * v_k - 1];
    v_b := v_slots[2 * v_k];
    if v_a is not null and v_b is not null then
      v_id := private.insert_bracket_match(v_stage, v_tournament.tenant_id, 1, v_k, v_a, null, v_b, null, v_when);
      v_cur_match[v_k] := v_id;
      v_count := v_count + 1;
    else
      v_cur_entry[v_k] := coalesce(v_a, v_b);
    end if;
  end loop;

  -- Rondas siguientes: cada partido toma a los dos participantes de la ronda anterior.
  v_prev_match := v_cur_match;
  for v_round in 2 .. v_rounds loop
    v_len := array_length(v_cur_match, 1) / 2;
    v_new_entry := array_fill(null::uuid, array[v_len]);
    v_new_match := array_fill(null::uuid, array[v_len]);
    v_prev_match := v_cur_match;
    v_when := case when p_first_date is null then null
                   else ((p_first_date + (v_round - 1) * p_days_between_rounds) + p_kickoff_time) at time zone v_timezone end;
    for v_k in 1 .. v_len loop
      v_id := private.insert_bracket_match(
        v_stage, v_tournament.tenant_id, v_round, v_k,
        v_cur_entry[2 * v_k - 1], v_cur_match[2 * v_k - 1],
        v_cur_entry[2 * v_k], v_cur_match[2 * v_k],
        v_when
      );
      v_new_match[v_k] := v_id;
      v_count := v_count + 1;
    end loop;
    v_cur_entry := v_new_entry;
    v_cur_match := v_new_match;
  end loop;

  -- Tercer puesto: perdedores de las dos semifinales (solo si ambas existen).
  if v_third then
    if v_rounds < 2 then
      raise exception 'Con 2 equipos solo hay final: no hay tercer puesto.' using errcode = 'check_violation';
    end if;
    if v_prev_match[1] is null or v_prev_match[2] is null then
      raise exception 'Con este número de equipos no hay dos semifinales completas: desactiva el tercer puesto.'
        using errcode = 'check_violation';
    end if;
    v_id_slot := private.insert_bracket_match(
      v_stage, v_tournament.tenant_id, v_rounds, 2,
      null, v_prev_match[1], null, v_prev_match[2],
      v_when, true, 'loser', 'loser'
    );
    v_count := v_count + 1;
  end if;

  return v_count;
end;
$$;

revoke all on function private.insert_bracket_match(public.tournament_stages, uuid, integer, integer, uuid, uuid, uuid, uuid, timestamptz, boolean, text, text) from public;
revoke all on function public.generate_single_elimination_bracket(uuid, date, integer, time, public.seeding_method, uuid[], boolean) from public, anon;
grant execute on function public.generate_single_elimination_bracket(uuid, date, integer, time, public.seeding_method, uuid[], boolean) to authenticated;
