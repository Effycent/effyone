-- =============================================================================
-- EffyOne · Fase 1A · Núcleo multi-tenant
--   * Roles de la plataforma
--   * tenants (clientes) y profiles (usuarios de cada cliente)
--   * Funciones auxiliares para RLS (esquema privado, no expuesto por la API)
--   * Políticas RLS: aislamiento total por tenant
--
-- Convención de seguridad para TODAS las tablas futuras:
--   1. Se habilita RLS.
--   2. `anon` no recibe permisos (denegado por defecto). La vista pública se
--      abrirá más adelante con vistas/funciones y GRANT explícitos.
--   3. `authenticated` recibe solo los GRANT que necesite, más políticas RLS.
--   4. Las escrituras administrativas (crear tenants, usuarios, cambiar plan)
--      las hace el servidor con la clave service_role, tras verificar el rol.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Denegado por defecto para anon en objetos nuevos del esquema public
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------------
-- Esquema privado para funciones auxiliares (no expuesto por PostgREST)
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('super_admin', 'tenant_admin', 'operator');

-- ---------------------------------------------------------------------------
-- Utilidad: mantener updated_at
-- ---------------------------------------------------------------------------
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- tenants: un cliente (complejo deportivo / equipo)
-- ---------------------------------------------------------------------------
create table public.tenants (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  country         text not null,
  timezone        text not null,
  logo_path       text,
  brand_primary   text,
  brand_secondary text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint tenants_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40
  ),
  constraint tenants_slug_reserved check (
    slug <> all (array[
      'admin', 'api', 'app', 'auth', 'backoffice', 'c', 'cambiar-clave',
      'effyone', 'login', 'planes', 'salir', 'soporte', 'static', 't', 'www'
    ])
  ),
  constraint tenants_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint tenants_country_format check (country ~ '^[A-Z]{2}$'),
  constraint tenants_brand_primary_hex check (
    brand_primary is null or brand_primary ~ '^#[0-9A-Fa-f]{6}$'
  ),
  constraint tenants_brand_secondary_hex check (
    brand_secondary is null or brand_secondary ~ '^#[0-9A-Fa-f]{6}$'
  )
);

comment on table public.tenants is 'Clientes de EffyOne. Unidad de aislamiento de datos.';
comment on column public.tenants.slug is 'Se usa en la URL /c/<slug>. Solo lo cambia el Super Admin.';
comment on column public.tenants.timezone is 'Zona horaria IANA (ej. America/Guayaquil).';

-- Valida que la zona horaria exista en PostgreSQL
create function private.validate_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise exception 'Zona horaria no válida: %', new.timezone
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger tenants_validate
  before insert or update on public.tenants
  for each row execute function private.validate_tenant();

create trigger tenants_touch_updated_at
  before update on public.tenants
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- profiles: usuarios de la plataforma (1 usuario = 1 tenant, salvo Super Admin)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  tenant_id            uuid references public.tenants (id) on delete restrict,
  role                 public.app_role not null,
  full_name            text not null,
  is_active            boolean not null default true,
  must_change_password boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint profiles_role_tenant check (
    (role = 'super_admin' and tenant_id is null)
    or (role <> 'super_admin' and tenant_id is not null)
  ),
  constraint profiles_full_name_length check (char_length(btrim(full_name)) between 2 and 120)
);

comment on table public.profiles is 'Rol y tenant de cada usuario de auth.users.';
comment on column public.profiles.is_active is 'Un perfil inactivo pierde todo acceso a datos de inmediato.';
comment on column public.profiles.must_change_password is 'true mientras el usuario use la contraseña temporal.';

create index profiles_tenant_id_idx on public.profiles (tenant_id);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Funciones auxiliares para RLS
-- Leen el perfil ACTUAL desde la base (no desde el JWT): si un usuario se
-- desactiva o cambia de rol, el efecto es inmediato y no espera a que expire
-- su token. SECURITY DEFINER evita recursión de RLS sobre profiles.
-- ---------------------------------------------------------------------------
create function private.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create function private.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'super_admin'
     from public.profiles p
     where p.id = (select auth.uid()) and p.is_active),
    false
  )
$$;

revoke all on function private.current_profile_role() from public;
revoke all on function private.current_tenant_id() from public;
revoke all on function private.is_super_admin() from public;
grant execute on function private.current_profile_role() to authenticated;
grant execute on function private.current_tenant_id() to authenticated;
grant execute on function private.is_super_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: tenants
-- ---------------------------------------------------------------------------
alter table public.tenants enable row level security;

revoke all on public.tenants from anon, authenticated;
grant select on public.tenants to authenticated;
-- Un Tenant Admin solo puede editar el perfil de su tenant (nunca slug ni,
-- más adelante, plan o estado de suscripción: esas columnas no se otorgan).
grant update (name, country, timezone, logo_path, brand_primary, brand_secondary)
  on public.tenants to authenticated;

create policy tenants_select
  on public.tenants for select to authenticated
  using (
    (select private.is_super_admin())
    or id = (select private.current_tenant_id())
  );

create policy tenants_update_own
  on public.tenants for update to authenticated
  using (
    id = (select private.current_tenant_id())
    and (select private.current_profile_role()) = 'tenant_admin'
  )
  with check (
    id = (select private.current_tenant_id())
    and (select private.current_profile_role()) = 'tenant_admin'
  );

-- ---------------------------------------------------------------------------
-- RLS: profiles (lectura únicamente; toda escritura pasa por el servidor)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create policy profiles_select
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_super_admin())
    or (
      tenant_id is not null
      and tenant_id = (select private.current_tenant_id())
      and (select private.current_profile_role()) = 'tenant_admin'
    )
  );
