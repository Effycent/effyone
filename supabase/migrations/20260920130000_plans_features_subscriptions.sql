-- =============================================================================
-- EffyOne · Fase 1B · Planes, funciones por plan y suscripciones
--   * Catálogo de funciones (feature_catalog) y matriz plan × función
--   * Planes editables desde el Backoffice (sin tocar código)
--   * Add-ons (catálogo)
--   * Estado de suscripción del tenant y ACCESO CALCULADO (nunca guardado):
--       full · grace · read_only · suspended · canceled
--   * Funciones de validación en backend: tenant_has_feature, tenant_feature_limit
--   * Reglas en base de datos: solo lectura en mora, límite de administradores,
--     operadores solo con vocalía online
--   * Registro inmutable de cambios de plan y estado
-- =============================================================================

create type public.subscription_status as enum ('active', 'past_due', 'suspended', 'canceled');

-- ---------------------------------------------------------------------------
-- Catálogo de funciones (lo define el código; los planes lo combinan)
-- ---------------------------------------------------------------------------
create table public.feature_catalog (
  feature_key          text primary key,
  kind                 text not null,
  category             text not null,
  name                 text not null,
  benefit              text not null,
  unit                 text,
  availability         text not null default 'coming_soon',
  phase                smallint,
  sort_order           integer not null default 0,
  paused_when_readonly boolean not null default false,
  created_at           timestamptz not null default now(),

  constraint feature_catalog_key_format check (feature_key ~ '^[a-z][a-z0-9_]{2,60}$'),
  constraint feature_catalog_kind check (kind in ('boolean', 'limit')),
  constraint feature_catalog_category check (
    category in ('limits', 'tournament', 'public', 'management', 'integrations')
  ),
  constraint feature_catalog_availability check (availability in ('available', 'coming_soon'))
);

comment on table public.feature_catalog is
  'Funciones que un plan puede incluir. availability=coming_soon las muestra como "Próximamente".';
comment on column public.feature_catalog.paused_when_readonly is
  'true = se pausa cuando el tenant está en solo lectura, suspendido o cancelado (integraciones).';

-- ---------------------------------------------------------------------------
-- Planes
-- ---------------------------------------------------------------------------
create table public.plans (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  price_cents integer not null default 0,
  currency    text not null default 'USD',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint plans_code_format check (code ~ '^[a-z][a-z0-9_]{1,29}$'),
  constraint plans_name_length check (char_length(btrim(name)) between 2 and 60),
  constraint plans_price_nonnegative check (price_cents >= 0),
  constraint plans_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint plans_default_is_active check (not is_default or is_active)
);

comment on table public.plans is 'Planes de suscripción. price_cents = 0 significa plan gratuito (no entra en mora).';
create unique index plans_single_default on public.plans (is_default) where is_default;

create trigger plans_touch_updated_at
  before update on public.plans
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Matriz plan × función
--   boolean: enabled = incluida o no
--   limit:   enabled = true y limit_value = tope (NULL = ilimitado)
-- ---------------------------------------------------------------------------
create table public.plan_features (
  plan_id     uuid not null references public.plans (id) on delete cascade,
  feature_key text not null references public.feature_catalog (feature_key) on delete restrict,
  enabled     boolean not null default false,
  limit_value integer,
  primary key (plan_id, feature_key),

  constraint plan_features_limit_nonnegative check (limit_value is null or limit_value >= 0)
);

create function private.validate_plan_feature()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
begin
  select fc.kind into v_kind
  from public.feature_catalog fc
  where fc.feature_key = new.feature_key;

  if v_kind = 'boolean' and new.limit_value is not null then
    raise exception 'La función % es de tipo sí/no y no lleva límite numérico.', new.feature_key
      using errcode = 'check_violation';
  end if;
  if v_kind = 'limit' then
    new.enabled := true;
  end if;
  return new;
end;
$$;

create trigger plan_features_validate
  before insert or update on public.plan_features
  for each row execute function private.validate_plan_feature();

-- ---------------------------------------------------------------------------
-- Add-ons (catálogo). La asignación por torneo llega en la Fase 2.
-- ---------------------------------------------------------------------------
create table public.addons (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  name                 text not null,
  description          text,
  price_cents          integer not null default 0,
  currency             text not null default 'USD',
  billing_unit         text not null default 'tournament_month',
  required_feature_key text references public.feature_catalog (feature_key),
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint addons_code_format check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint addons_name_length check (char_length(btrim(name)) between 2 and 80),
  constraint addons_price_nonnegative check (price_cents >= 0),
  constraint addons_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint addons_billing_unit check (billing_unit in ('tournament_month', 'tenant_month'))
);

create trigger addons_touch_updated_at
  before update on public.addons
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Ajustes globales de la plataforma (una sola fila)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  id                     boolean primary key default true,
  grace_days             integer not null default 3,
  canceled_retention_days integer not null default 90,
  updated_at             timestamptz not null default now(),

  constraint platform_settings_single_row check (id),
  constraint platform_settings_grace_days check (grace_days between 0 and 30),
  constraint platform_settings_retention_days check (canceled_retention_days between 1 and 3650)
);

comment on column public.platform_settings.grace_days is
  'Días con todo funcionando desde que se marca "en mora", antes de pasar a solo lectura.';
comment on column public.platform_settings.canceled_retention_days is
  'Días que se conservan los datos de un cliente cancelado antes de poder eliminarlos.';

create trigger platform_settings_touch_updated_at
  before update on public.platform_settings
  for each row execute function private.touch_updated_at();

insert into public.platform_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Semillas: funciones
-- ---------------------------------------------------------------------------
insert into public.feature_catalog
  (feature_key, kind, category, name, benefit, unit, availability, phase, sort_order, paused_when_readonly)
values
  ('max_sport_types',            'limit',   'limits',       'Tipos de deporte',                  'Organiza torneos de distintos deportes',                        'deportes',       'coming_soon', 2,  10, false),
  ('max_active_tournaments',     'limit',   'limits',       'Torneos activos',                   'Lleva varios torneos al mismo tiempo',                          'torneos',        'coming_soon', 2,  20, false),
  ('max_teams_per_tournament',   'limit',   'limits',       'Equipos por torneo',                'Inscribe más equipos en cada torneo',                           'equipos',        'coming_soon', 2,  30, false),
  ('max_players_per_tournament', 'limit',   'limits',       'Jugadores por torneo',              'Registra a todos tus jugadores',                                'jugadores',      'coming_soon', 2,  40, false),
  ('max_admins',                 'limit',   'limits',       'Administradores',                   'Suma personas que gestionen tu complejo',                       'administradores','available',   1,  50, false),

  ('auto_fixtures',              'boolean', 'tournament',   'Calendarios automáticos',           'Genera el calendario de partidos en un clic',                   null,             'coming_soon', 2, 110, false),
  ('match_sheet_pdf',            'boolean', 'tournament',   'Hojas de vocalía en PDF',           'Imprime la hoja de cada partido lista para la cancha',          null,             'coming_soon', 3, 120, false),
  ('admin_live_stats',           'boolean', 'tournament',   'Estadísticas en tiempo real',       'Mira tablas y goleadores actualizarse mientras se juega',       null,             'coming_soon', 3, 130, false),
  ('admin_records_events',       'boolean', 'tournament',   'Resultados y eventos',              'Anota goles, tarjetas y resultados desde tu panel',             null,             'coming_soon', 3, 140, false),

  ('ad_free',                    'boolean', 'public',       'Sin publicidad',                    'Usa EffyOne sin banners ni pie publicitario en tus PDF',        null,             'available',   1, 210, false),
  ('public_panel',               'boolean', 'public',       'Panel público para tus hinchas',    'Tus fans siguen partidos y tablas desde el celular',            null,             'coming_soon', 3, 220, false),
  ('tenant_branding',            'boolean', 'public',       'Tu marca en el panel público',      'Muestra tu logo y tus colores a tus hinchas',                   null,             'coming_soon', 4, 230, false),
  ('private_tournaments',        'boolean', 'public',       'Torneos privados',                  'Decide qué torneos puede ver el público',                       null,             'coming_soon', 3, 240, false),

  ('officials_management',       'boolean', 'management',   'Árbitros y vocales',                'Registra a tus árbitros y vocales y asígnalos a cada partido',  null,             'coming_soon', 3, 310, false),
  ('online_match_sheet',         'boolean', 'management',   'Vocalía online desde el celular',   'Tu vocal llena la hoja del partido en vivo desde el móvil',     null,             'coming_soon', 3, 320, false),
  ('cards_suspensions',          'boolean', 'management',   'Tarjetas y suspendidos',            'Controla tarjetas acumuladas y quién está suspendido',          null,             'coming_soon', 3, 330, false),
  ('accounting',                 'boolean', 'management',   'Contabilidad del torneo',           'Lleva vocalías, multas y deudas de cada equipo',                null,             'coming_soon', 6, 340, false),
  ('addon_stats_service_eligible','boolean','management',   'Servicio de estadísticas',          'Contrata a EffyOne para llevar las estadísticas de tu torneo',  null,             'coming_soon', 2, 350, false),

  ('data_export',                'boolean', 'integrations', 'Exportar a Excel y CSV',            'Descarga tablas y resultados para compartirlos',                null,             'coming_soon', 5, 410, false),
  ('sheets_backup',              'boolean', 'integrations', 'Respaldo automático en Google Sheets','Tus datos siempre copiados en una hoja de cálculo',           null,             'coming_soon', 5, 420, true),
  ('outbound_webhooks',          'boolean', 'integrations', 'Conexión con tus herramientas',     'Envía tus resultados automáticamente a otras aplicaciones',     null,             'coming_soon', 5, 430, true),
  ('read_api',                   'boolean', 'integrations', 'Acceso a tus datos para tu web o app','Conecta tu sitio o aplicación con tus tablas y resultados',   null,             'coming_soon', 5, 440, true);

-- ---------------------------------------------------------------------------
-- Semillas: planes (Bronce gratis con publicidad, Plata $37, Oro $92)
-- ---------------------------------------------------------------------------
insert into public.plans (code, name, description, price_cents, currency, sort_order, is_default)
values
  ('bronze', 'Bronce', 'Gratis para siempre, con publicidad de EffyOne.', 0, 'USD', 10, true),
  ('silver', 'Plata',  'Sin publicidad, panel público con tu marca, árbitros, vocales y contabilidad.', 3700, 'USD', 20, false),
  ('gold',   'Oro',    'Todo Plata, más vocalía online, tarjetas y suspendidos, exportaciones e integraciones.', 9200, 'USD', 30, false);

-- Límites (NULL = ilimitado)
insert into public.plan_features (plan_id, feature_key, enabled, limit_value)
select p.id, v.feature_key, true, v.limit_value
from (values
  ('bronze', 'max_sport_types',            1),
  ('bronze', 'max_teams_per_tournament',   5),
  ('bronze', 'max_players_per_tournament', 75),
  ('bronze', 'max_active_tournaments',     1),
  ('bronze', 'max_admins',                 1),
  ('silver', 'max_sport_types',            2),
  ('silver', 'max_teams_per_tournament',   16),
  ('silver', 'max_players_per_tournament', 320),
  ('silver', 'max_active_tournaments',     3),
  ('silver', 'max_admins',                 2),
  ('gold',   'max_sport_types',            5),
  ('gold',   'max_teams_per_tournament',   20),
  ('gold',   'max_players_per_tournament', 500),
  ('gold',   'max_active_tournaments',     10),
  ('gold',   'max_admins',                 null)
) as v(plan_code, feature_key, limit_value)
join public.plans p on p.code = v.plan_code;

-- Funciones sí/no
insert into public.plan_features (plan_id, feature_key, enabled)
select p.id, fc.feature_key, fc.feature_key = any (v.included)
from (values
  ('bronze', array[
    'auto_fixtures', 'match_sheet_pdf', 'admin_live_stats', 'admin_records_events'
  ]),
  ('silver', array[
    'auto_fixtures', 'match_sheet_pdf', 'admin_live_stats', 'admin_records_events',
    'ad_free', 'public_panel', 'tenant_branding', 'private_tournaments',
    'officials_management', 'accounting'
  ]),
  ('gold', array[
    'auto_fixtures', 'match_sheet_pdf', 'admin_live_stats', 'admin_records_events',
    'ad_free', 'public_panel', 'tenant_branding', 'private_tournaments',
    'officials_management', 'accounting',
    'online_match_sheet', 'cards_suspensions', 'addon_stats_service_eligible',
    'data_export', 'sheets_backup', 'outbound_webhooks', 'read_api'
  ])
) as v(plan_code, included)
join public.plans p on p.code = v.plan_code
cross join public.feature_catalog fc
where fc.kind = 'boolean';

insert into public.addons (code, name, description, price_cents, billing_unit, required_feature_key)
values (
  'stats_service',
  'Servicio de estadísticas',
  'EffyOne lleva las estadísticas de tu torneo. Servicio manual, cobrado por torneo.',
  2500,
  'tournament_month',
  'addon_stats_service_eligible'
);

-- ---------------------------------------------------------------------------
-- tenants: plan y estado de suscripción
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column plan_id uuid references public.plans (id) on delete restrict,
  add column subscription_status public.subscription_status not null default 'active',
  add column past_due_since timestamptz,
  add column suspended_at timestamptz,
  add column canceled_at timestamptz;

update public.tenants
set plan_id = (select id from public.plans where is_default);

alter table public.tenants alter column plan_id set not null;
create index tenants_plan_id_idx on public.tenants (plan_id);

alter table public.tenants
  add constraint tenants_past_due_date check (
    subscription_status <> 'past_due' or past_due_since is not null
  );

-- Plan por defecto en altas nuevas y "un plan gratuito no entra en mora"
create function private.tenants_subscription_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price integer;
begin
  if new.plan_id is null then
    select p.id into new.plan_id
    from public.plans p
    where p.is_default and p.is_active;
    if new.plan_id is null then
      raise exception 'No hay un plan por defecto configurado.' using errcode = 'check_violation';
    end if;
  end if;

  if new.subscription_status = 'past_due' then
    select p.price_cents into v_price from public.plans p where p.id = new.plan_id;
    if v_price = 0 then
      raise exception 'Un plan gratuito no entra en mora.' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger tenants_subscription_guard
  before insert or update on public.tenants
  for each row execute function private.tenants_subscription_guard();

-- ---------------------------------------------------------------------------
-- Registro inmutable de cambios de plan y estado
-- ---------------------------------------------------------------------------
create table public.tenant_subscription_events (
  id         bigint generated always as identity primary key,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  event_type text not null,
  from_value text,
  to_value   text,
  note       text,
  actor_id   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint tenant_subscription_events_type check (event_type in ('plan_changed', 'status_changed'))
);

create index tenant_subscription_events_tenant_idx
  on public.tenant_subscription_events (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Acceso calculado. NUNCA se guarda: se deriva del estado y la fecha.
--   full       activo
--   grace      en mora dentro de los días de gracia (todo funciona)
--   read_only  en mora pasada la gracia (solo lectura)
--   suspended  suspendido por el propietario (solo lectura, vista pública oculta)
--   canceled   cancelado (igual que suspendido, con cuenta atrás de eliminación)
-- ---------------------------------------------------------------------------
create function private.tenant_access_state(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case t.subscription_status
    when 'active' then 'full'
    when 'past_due' then
      case
        when now() < t.past_due_since + make_interval(days => s.grace_days) then 'grace'
        else 'read_only'
      end
    when 'suspended' then 'suspended'
    when 'canceled' then 'canceled'
  end
  from public.tenants t
  cross join public.platform_settings s
  where t.id = p_tenant_id
$$;

create function private.tenant_can_write(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.tenant_access_state(p_tenant_id) in ('full', 'grace'), false)
$$;

create function private.current_plan_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.plan_id
  from public.tenants t
  where t.id = private.current_tenant_id()
$$;

-- Quién puede consultar el estado de un tenant: su propio equipo, el Super Admin
-- y el servidor (service_role, para Edge Functions y tareas programadas).
create function private.can_inspect_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_super_admin()
    or p_tenant_id = private.current_tenant_id()
    or coalesce((select auth.role()), '') = 'service_role'
$$;

-- ¿Incluye el plan del tenant esta función? (sin comprobar quién pregunta)
create function private.feature_enabled(p_tenant_id uuid, p_feature_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select pf.enabled
       and (
         not fc.paused_when_readonly
         or private.tenant_access_state(p_tenant_id) in ('full', 'grace')
       )
    from public.tenants t
    join public.plan_features pf on pf.plan_id = t.plan_id and pf.feature_key = p_feature_key
    join public.feature_catalog fc on fc.feature_key = pf.feature_key
    where t.id = p_tenant_id
  ), false)
$$;

-- Límite numérico del plan: NULL = ilimitado, 0 = no incluido.
create function private.feature_limit(p_tenant_id uuid, p_feature_key text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_limit integer;
begin
  select pf.enabled, pf.limit_value
    into v_enabled, v_limit
  from public.tenants t
  join public.plan_features pf on pf.plan_id = t.plan_id and pf.feature_key = p_feature_key
  where t.id = p_tenant_id;

  if not found or not v_enabled then
    return 0;
  end if;
  return v_limit;
end;
$$;

-- API pública de validación (callable por RPC; verifica quién pregunta)
create function public.tenant_has_feature(p_tenant_id uuid, p_feature_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_inspect_tenant(p_tenant_id) then
    return false;
  end if;
  return private.feature_enabled(p_tenant_id, p_feature_key);
end;
$$;

create function public.tenant_feature_limit(p_tenant_id uuid, p_feature_key text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_inspect_tenant(p_tenant_id) then
    return 0;
  end if;
  return private.feature_limit(p_tenant_id, p_feature_key);
end;
$$;

-- Todas las funciones del tenant en una consulta (para la interfaz)
create function public.tenant_entitlements(p_tenant_id uuid)
returns table (
  feature_key  text,
  kind         text,
  enabled      boolean,
  limit_value  integer,
  unlimited    boolean,
  availability text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_plan_id uuid;
begin
  if not private.can_inspect_tenant(p_tenant_id) then
    return;
  end if;

  v_state := private.tenant_access_state(p_tenant_id);
  select t.plan_id into v_plan_id from public.tenants t where t.id = p_tenant_id;

  return query
  select
    fc.feature_key,
    fc.kind,
    coalesce(pf.enabled, false)
      and (not fc.paused_when_readonly or v_state in ('full', 'grace')),
    case when pf.enabled then pf.limit_value end,
    (fc.kind = 'limit' and coalesce(pf.enabled, false) and pf.limit_value is null),
    fc.availability
  from public.feature_catalog fc
  left join public.plan_features pf
    on pf.feature_key = fc.feature_key and pf.plan_id = v_plan_id
  order by fc.sort_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reglas de plan sobre los usuarios (se cumplen aunque escriba el servidor)
--   * Administradores activos <= max_admins del plan
--   * Operadores solo si el plan incluye vocalía online
-- Un exceso previo (bajada de plan) se conserva; solo se bloquean altas nuevas.
-- ---------------------------------------------------------------------------
create function private.enforce_profile_plan_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if new.tenant_id is null or not new.is_active then
    return new;
  end if;

  -- Solo altas, reactivaciones o cambios de rol/tenant.
  if tg_op = 'UPDATE'
     and old.is_active
     and old.role = new.role
     and old.tenant_id is not distinct from new.tenant_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text, 0));

  if new.role = 'tenant_admin' then
    v_limit := private.feature_limit(new.tenant_id, 'max_admins');
    if v_limit is not null then
      select count(*) into v_count
      from public.profiles p
      where p.tenant_id = new.tenant_id
        and p.role = 'tenant_admin'
        and p.is_active
        and p.id <> new.id;
      if v_count >= v_limit then
        raise exception
          'Tu plan permite % administrador(es) activo(s). Mejora tu plan para agregar más.', v_limit
          using errcode = 'check_violation';
      end if;
    end if;
  elsif new.role = 'operator' then
    if not private.feature_enabled(new.tenant_id, 'online_match_sheet') then
      raise exception 'Tu plan no incluye operadores con vocalía online.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_enforce_plan_rules
  before insert or update of role, is_active, tenant_id on public.profiles
  for each row execute function private.enforce_profile_plan_rules();

-- ---------------------------------------------------------------------------
-- Vista para listados y banners: tenant + plan + acceso calculado
-- ---------------------------------------------------------------------------
create view public.tenant_overview
with (security_invoker = true) as
select
  t.id,
  t.slug,
  t.name,
  t.country,
  t.timezone,
  t.created_at,
  t.plan_id,
  p.code  as plan_code,
  p.name  as plan_name,
  p.price_cents,
  p.currency,
  t.subscription_status,
  t.past_due_since,
  t.suspended_at,
  t.canceled_at,
  private.tenant_access_state(t.id) as access_state,
  case when t.subscription_status = 'past_due'
    then t.past_due_since + make_interval(days => s.grace_days) end as grace_ends_at,
  case when t.subscription_status = 'canceled'
    then t.canceled_at + make_interval(days => s.canceled_retention_days) end as purge_eligible_at
from public.tenants t
join public.plans p on p.id = t.plan_id
cross join public.platform_settings s;

-- ---------------------------------------------------------------------------
-- RPC del Super Admin: cambian plan/estado Y registran el evento en un solo paso
-- ---------------------------------------------------------------------------
create function public.admin_set_tenant_plan(
  p_tenant_id uuid,
  p_plan_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants%rowtype;
  v_old_plan public.plans%rowtype;
  v_new_plan public.plans%rowtype;
  v_reset_due boolean;
begin
  if not private.is_super_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select * into v_tenant from public.tenants where id = p_tenant_id for update;
  if not found then
    raise exception 'Cliente no encontrado.' using errcode = 'P0002';
  end if;

  select * into v_new_plan from public.plans where id = p_plan_id;
  if not found or not v_new_plan.is_active then
    raise exception 'Ese plan no está disponible.' using errcode = 'check_violation';
  end if;

  if v_tenant.plan_id = p_plan_id then
    return;
  end if;

  select * into v_old_plan from public.plans where id = v_tenant.plan_id;
  v_reset_due := v_tenant.subscription_status = 'past_due' and v_new_plan.price_cents = 0;

  update public.tenants
  set plan_id = p_plan_id,
      subscription_status = case when v_reset_due then 'active' else subscription_status end,
      past_due_since = case when v_reset_due then null else past_due_since end
  where id = p_tenant_id;

  insert into public.tenant_subscription_events (tenant_id, event_type, from_value, to_value, note, actor_id)
  values (p_tenant_id, 'plan_changed', v_old_plan.name, v_new_plan.name, nullif(btrim(p_note), ''), (select auth.uid()));

  if v_reset_due then
    insert into public.tenant_subscription_events (tenant_id, event_type, from_value, to_value, note, actor_id)
    values (p_tenant_id, 'status_changed', 'past_due', 'active', 'Cambio a un plan gratuito', (select auth.uid()));
  end if;
end;
$$;

create function public.admin_set_subscription_status(
  p_tenant_id uuid,
  p_status public.subscription_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants%rowtype;
  v_price integer;
begin
  if not private.is_super_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select * into v_tenant from public.tenants where id = p_tenant_id for update;
  if not found then
    raise exception 'Cliente no encontrado.' using errcode = 'P0002';
  end if;

  select p.price_cents into v_price from public.plans p where p.id = v_tenant.plan_id;
  if p_status = 'past_due' and v_price = 0 then
    raise exception 'Un plan gratuito no entra en mora.' using errcode = 'check_violation';
  end if;

  -- Repetir el mismo estado no reinicia relojes (ej. la cuenta de gracia).
  if v_tenant.subscription_status = p_status then
    return;
  end if;

  update public.tenants
  set subscription_status = p_status,
      past_due_since = case when p_status = 'past_due' then now() end,
      suspended_at   = case when p_status = 'suspended' then now() end,
      canceled_at    = case when p_status = 'canceled' then now() end
  where id = p_tenant_id;

  insert into public.tenant_subscription_events (tenant_id, event_type, from_value, to_value, note, actor_id)
  values (p_tenant_id, 'status_changed', v_tenant.subscription_status::text, p_status::text,
          nullif(btrim(p_note), ''), (select auth.uid()));
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de funciones
-- ---------------------------------------------------------------------------
revoke all on function private.tenant_access_state(uuid) from public;
revoke all on function private.tenant_can_write(uuid) from public;
revoke all on function private.current_plan_id() from public;
revoke all on function private.can_inspect_tenant(uuid) from public;
revoke all on function private.feature_enabled(uuid, text) from public;
revoke all on function private.feature_limit(uuid, text) from public;
grant execute on function private.tenant_access_state(uuid) to authenticated;
grant execute on function private.tenant_can_write(uuid) to authenticated;
grant execute on function private.current_plan_id() to authenticated;
grant execute on function private.can_inspect_tenant(uuid) to authenticated;
grant execute on function private.feature_enabled(uuid, text) to authenticated;
grant execute on function private.feature_limit(uuid, text) to authenticated;

revoke all on function public.tenant_has_feature(uuid, text) from public, anon;
revoke all on function public.tenant_feature_limit(uuid, text) from public, anon;
revoke all on function public.tenant_entitlements(uuid) from public, anon;
revoke all on function public.admin_set_tenant_plan(uuid, uuid, text) from public, anon;
revoke all on function public.admin_set_subscription_status(uuid, public.subscription_status, text) from public, anon;
grant execute on function public.tenant_has_feature(uuid, text) to authenticated, service_role;
grant execute on function public.tenant_feature_limit(uuid, text) to authenticated, service_role;
grant execute on function public.tenant_entitlements(uuid) to authenticated, service_role;
grant execute on function public.admin_set_tenant_plan(uuid, uuid, text) to authenticated;
grant execute on function public.admin_set_subscription_status(uuid, public.subscription_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.feature_catalog enable row level security;
alter table public.plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.addons enable row level security;
alter table public.platform_settings enable row level security;
alter table public.tenant_subscription_events enable row level security;

revoke all on public.feature_catalog from anon, authenticated;
revoke all on public.plans from anon, authenticated;
revoke all on public.plan_features from anon, authenticated;
revoke all on public.addons from anon, authenticated;
revoke all on public.platform_settings from anon, authenticated;
revoke all on public.tenant_subscription_events from anon, authenticated;
revoke all on public.tenant_overview from anon, authenticated;

grant select on public.feature_catalog to authenticated;
grant select, insert, update, delete on public.plans to authenticated;
grant select, insert, update, delete on public.plan_features to authenticated;
grant select, insert, update, delete on public.addons to authenticated;
grant select, update on public.platform_settings to authenticated;
grant select on public.tenant_subscription_events to authenticated;
grant select on public.tenant_overview to authenticated;

-- Catálogo, matriz y ajustes: lectura para toda sesión (la interfaz muestra
-- funciones bloqueadas y a qué plan pertenecen); escritura solo Super Admin.
create policy feature_catalog_select on public.feature_catalog
  for select to authenticated using (true);

create policy plans_select on public.plans
  for select to authenticated
  using (
    is_active
    or (select private.is_super_admin())
    or id = (select private.current_plan_id())
  );
create policy plans_write on public.plans
  for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

create policy plan_features_select on public.plan_features
  for select to authenticated using (true);
create policy plan_features_write on public.plan_features
  for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

create policy addons_select on public.addons
  for select to authenticated
  using (is_active or (select private.is_super_admin()));
create policy addons_write on public.addons
  for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

create policy platform_settings_select on public.platform_settings
  for select to authenticated using (true);
create policy platform_settings_update on public.platform_settings
  for update to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

create policy tenant_subscription_events_select on public.tenant_subscription_events
  for select to authenticated
  using ((select private.is_super_admin()));

-- ---------------------------------------------------------------------------
-- Solo lectura: el Administrador solo edita su tenant si el acceso permite escribir.
-- Regla para TODAS las tablas de negocio futuras: sus políticas de escritura
-- deben incluir private.tenant_can_write(tenant_id).
-- ---------------------------------------------------------------------------
drop policy tenants_update_own on public.tenants;

create policy tenants_update_own
  on public.tenants for update to authenticated
  using (
    id = (select private.current_tenant_id())
    and (select private.current_profile_role()) = 'tenant_admin'
    and (select private.tenant_can_write(id))
  )
  with check (
    id = (select private.current_tenant_id())
    and (select private.current_profile_role()) = 'tenant_admin'
    and (select private.tenant_can_write(id))
  );
