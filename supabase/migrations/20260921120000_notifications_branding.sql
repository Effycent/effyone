-- =============================================================================
-- EffyOne · Fase 1C · Notificaciones, marca del cliente y logo
--   * Notificaciones con CANALES INTERCAMBIABLES: hoy solo "in_app"; el correo
--     ya está previsto (notification_deliveries + platform_settings) y se
--     activará cuando exista dominio, sin cambiar el resto del sistema.
--   * Avisos de mora generados desde el estado de la suscripción (sin cron).
--   * Solicitud de cambio de plan del cliente → aviso para el Super Admin.
--   * Marca (logo y colores) solo con la función tenant_branding, validada en BD.
--   * Bucket público de logos con políticas por cliente.
--   * tenant_entitlements distingue "no incluida en el plan" de "en pausa por mora".
-- =============================================================================

alter table public.platform_settings
  add column email_channel_enabled boolean not null default false;

comment on column public.platform_settings.email_channel_enabled is
  'Cuando exista dominio para enviar correos: true crea también una entrega pendiente por correo por cada aviso.';

-- ---------------------------------------------------------------------------
-- Avisos
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         bigint generated always as identity primary key,
  audience   text not null,
  tenant_id  uuid references public.tenants (id) on delete cascade,
  kind       text not null,
  severity   text not null default 'info',
  title      text not null,
  body       text,
  link       text,
  dedupe_key text unique,
  created_at timestamptz not null default now(),

  constraint notifications_audience check (audience in ('tenant', 'platform')),
  constraint notifications_severity check (severity in ('info', 'warning', 'critical')),
  constraint notifications_tenant_required check (audience <> 'tenant' or tenant_id is not null)
);

comment on table public.notifications is
  'Aviso único. audience=tenant: lo ven los administradores de ese cliente. audience=platform: lo ve el Super Admin.';
comment on column public.notifications.dedupe_key is
  'Evita avisos repetidos para el mismo hecho (ej. el mismo ciclo de mora).';

create index notifications_audience_idx
  on public.notifications (audience, tenant_id, created_at desc);

create table public.notification_reads (
  notification_id bigint not null references public.notifications (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- Un registro por aviso y canal. "in_app" se entrega al crear el aviso.
-- "email" queda 'pending' hasta que un envío programado lo procese.
create table public.notification_deliveries (
  id              bigint generated always as identity primary key,
  notification_id bigint not null references public.notifications (id) on delete cascade,
  channel         text not null,
  status          text not null default 'pending',
  attempts        integer not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,

  constraint notification_deliveries_channel check (channel in ('in_app', 'email')),
  constraint notification_deliveries_status check (status in ('pending', 'sent', 'failed', 'skipped')),
  constraint notification_deliveries_unique unique (notification_id, channel)
);

-- Crea el aviso y sus entregas por canal. Devuelve NULL si ya existía (dedupe_key).
create function private.notify(
  p_audience   text,
  p_tenant_id  uuid,
  p_kind       text,
  p_severity   text,
  p_title      text,
  p_body       text,
  p_link       text,
  p_dedupe_key text default null,
  p_created_at timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_email boolean;
begin
  insert into public.notifications
    (audience, tenant_id, kind, severity, title, body, link, dedupe_key, created_at)
  values
    (p_audience, p_tenant_id, p_kind, p_severity, p_title, p_body, p_link, p_dedupe_key, p_created_at)
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    return null;
  end if;

  insert into public.notification_deliveries (notification_id, channel, status, sent_at)
  values (v_id, 'in_app', 'sent', now());

  select s.email_channel_enabled into v_email from public.platform_settings s;
  if coalesce(v_email, false) then
    insert into public.notification_deliveries (notification_id, channel, status)
    values (v_id, 'email', 'pending');
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Avisos de mora: se derivan del estado y la fecha (idempotente por ciclo de mora)
--   día 0          → "Tu pago está vencido"
--   1 día antes    → "Tu periodo de gracia termina pronto"
--   fin de gracia  → "Tu cuenta está en solo lectura"
-- Cada aviso lleva la fecha del hito, aunque se genere después.
-- ---------------------------------------------------------------------------
create function private.sync_billing_notifications(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tenants%rowtype;
  s public.platform_settings%rowtype;
  v_end timestamptz;
  v_cycle text;
  v_link text;
  v_end_text text;
begin
  select * into t from public.tenants where id = p_tenant_id;
  if not found or t.subscription_status <> 'past_due' then
    return;
  end if;

  select * into s from public.platform_settings;
  v_end := t.past_due_since + make_interval(days => s.grace_days);
  v_cycle := extract(epoch from t.past_due_since)::bigint::text;
  v_link := '/c/' || t.slug || '/plan';
  v_end_text := to_char(v_end at time zone t.timezone, 'DD/MM/YYYY HH24:MI');

  perform private.notify(
    'tenant', t.id, 'billing_past_due', 'warning',
    'Tu pago está vencido',
    case when s.grace_days > 0
      then 'Regulariza tu pago antes del ' || v_end_text
           || '. Hasta entonces todo sigue funcionando; después tu cuenta pasará a solo lectura.'
      else 'Tu cuenta está en solo lectura hasta que regularices tu pago.'
    end,
    v_link, 'billing_past_due:' || t.id || ':' || v_cycle, t.past_due_since
  );

  if s.grace_days > 0 and now() >= v_end - interval '1 day' then
    perform private.notify(
      'tenant', t.id, 'billing_grace_ending', 'warning',
      'Tu periodo de gracia termina pronto',
      'Vence el ' || v_end_text || '. Después no podrás modificar tus datos.',
      v_link, 'billing_grace_ending:' || t.id || ':' || v_cycle,
      greatest(v_end - interval '1 day', t.past_due_since)
    );
  end if;

  if now() >= v_end then
    perform private.notify(
      'tenant', t.id, 'billing_read_only', 'critical',
      'Tu cuenta está en solo lectura',
      'Puedes ver tus datos, pero no modificarlos, hasta que regularices tu pago.',
      v_link, 'billing_read_only:' || t.id || ':' || v_cycle, v_end
    );
  end if;
end;
$$;

-- El panel del cliente la llama al cargar: genera los avisos que ya toquen.
create function public.sync_my_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_profile_role() = 'tenant_admin' then
    perform private.sync_billing_notifications(private.current_tenant_id());
  end if;
end;
$$;

-- Avisos sin leer del usuario actual (respeta RLS: solo cuenta los que puede ver)
create function public.my_unread_notifications()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.notifications n
  where not exists (
    select 1 from public.notification_reads r
    where r.notification_id = n.id and r.user_id = (select auth.uid())
  )
$$;

-- ---------------------------------------------------------------------------
-- RPC del Super Admin: ahora también avisan al cliente
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_tenant_plan(
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

  perform private.notify(
    'tenant', p_tenant_id, 'plan_changed', 'info',
    'Tu plan ahora es ' || v_new_plan.name,
    'El cambio ya está activo. Revisa lo que incluye tu plan en la sección Mi plan.',
    '/c/' || v_tenant.slug || '/plan'
  );
end;
$$;

create or replace function public.admin_set_subscription_status(
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
  v_retention integer;
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

  if p_status = 'past_due' then
    perform private.sync_billing_notifications(p_tenant_id);
  elsif p_status = 'active' then
    perform private.notify(
      'tenant', p_tenant_id, 'billing_active', 'info',
      'Tu suscripción está al día',
      'Gracias. Tu cuenta vuelve a tener acceso completo.',
      '/c/' || v_tenant.slug || '/plan'
    );
  elsif p_status = 'suspended' then
    perform private.notify(
      'tenant', p_tenant_id, 'billing_suspended', 'critical',
      'Tu cuenta fue suspendida',
      'Tus datos están seguros y puedes verlos, pero no modificarlos. Contacta a EffyOne para reactivarla.',
      '/c/' || v_tenant.slug || '/plan'
    );
  elsif p_status = 'canceled' then
    select s.canceled_retention_days into v_retention from public.platform_settings s;
    perform private.notify(
      'tenant', p_tenant_id, 'billing_canceled', 'critical',
      'Tu suscripción fue cancelada',
      'Conservamos tus datos hasta el '
        || to_char((now() + make_interval(days => v_retention)) at time zone v_tenant.timezone, 'DD/MM/YYYY')
        || '. Puedes reactivarla antes de esa fecha.',
      '/c/' || v_tenant.slug || '/plan'
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Solicitud de cambio de plan (cliente → Super Admin)
-- ---------------------------------------------------------------------------
create function public.request_plan_upgrade(p_plan_id uuid, p_message text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants%rowtype;
  v_current public.plans%rowtype;
  v_plan public.plans%rowtype;
  v_name text;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_id bigint;
begin
  if private.current_profile_role() is distinct from 'tenant_admin' then
    raise exception 'Solo un administrador del cliente puede solicitar un cambio de plan.'
      using errcode = '42501';
  end if;
  if v_message is not null and char_length(v_message) > 300 then
    raise exception 'El mensaje admite hasta 300 caracteres.' using errcode = 'check_violation';
  end if;

  select * into v_tenant from public.tenants where id = private.current_tenant_id();

  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if not found then
    raise exception 'Ese plan no está disponible.' using errcode = 'check_violation';
  end if;
  if v_plan.id = v_tenant.plan_id then
    raise exception 'Ya tienes ese plan.' using errcode = 'check_violation';
  end if;

  select * into v_current from public.plans where id = v_tenant.plan_id;
  select p.full_name into v_name from public.profiles p where p.id = (select auth.uid());

  v_id := private.notify(
    'platform', v_tenant.id, 'upgrade_requested', 'info',
    v_tenant.name || ' solicita el plan ' || v_plan.name,
    coalesce(v_name, 'Un administrador') || ' pidió pasar de ' || v_current.name || ' a ' || v_plan.name || '.'
      || case when v_message is not null then E'\nMensaje: ' || v_message else '' end,
    '/backoffice/clientes/' || v_tenant.id,
    'upgrade_requested:' || v_tenant.id || ':' || v_plan.id || ':' || current_date::text
  );

  return v_id is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Marca del cliente: solo con la función tenant_branding (validado en la BD)
-- ---------------------------------------------------------------------------
create function private.tenants_branding_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo se bloquea PONER o CAMBIAR marca; quitarla siempre está permitido
  -- (por ejemplo, un cliente que bajó de plan puede retirar su logo).
  if (   (new.logo_path is distinct from old.logo_path and new.logo_path is not null)
      or (new.brand_primary is distinct from old.brand_primary and new.brand_primary is not null)
      or (new.brand_secondary is distinct from old.brand_secondary and new.brand_secondary is not null))
     and not (private.is_super_admin() or coalesce((select auth.role()), '') = 'service_role')
     and not private.feature_enabled(new.id, 'tenant_branding')
  then
    raise exception 'Tu plan no incluye tu marca (logo y colores). Mejora tu plan para usarla.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger tenants_branding_guard
  before update on public.tenants
  for each row execute function private.tenants_branding_guard();

-- La configuración de marca (logo y colores) ya funciona desde esta fase;
-- se mostrará a los hinchas cuando llegue el panel público.
update public.feature_catalog
set availability = 'available', phase = 1
where feature_key = 'tenant_branding';

-- ---------------------------------------------------------------------------
-- tenant_entitlements: separa "no incluida" de "en pausa por mora"
-- ---------------------------------------------------------------------------
drop function public.tenant_entitlements(uuid);

create function public.tenant_entitlements(p_tenant_id uuid)
returns table (
  feature_key  text,
  kind         text,
  enabled      boolean,
  in_plan      boolean,
  paused       boolean,
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
      and not (fc.paused_when_readonly and v_state not in ('full', 'grace')),
    coalesce(pf.enabled, false),
    coalesce(pf.enabled, false) and fc.paused_when_readonly and v_state not in ('full', 'grace'),
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
-- Permisos de funciones
-- ---------------------------------------------------------------------------
revoke all on function private.notify(text, uuid, text, text, text, text, text, text, timestamptz) from public;
revoke all on function private.sync_billing_notifications(uuid) from public;

revoke all on function public.sync_my_notifications() from public, anon;
revoke all on function public.my_unread_notifications() from public, anon;
revoke all on function public.request_plan_upgrade(uuid, text) from public, anon;
revoke all on function public.tenant_entitlements(uuid) from public, anon;
grant execute on function public.sync_my_notifications() to authenticated;
grant execute on function public.my_unread_notifications() to authenticated;
grant execute on function public.request_plan_upgrade(uuid, text) to authenticated;
grant execute on function public.tenant_entitlements(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS de avisos
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.notification_deliveries enable row level security;

revoke all on public.notifications from anon, authenticated;
revoke all on public.notification_reads from anon, authenticated;
revoke all on public.notification_deliveries from anon, authenticated;

grant select on public.notifications to authenticated;
grant select, insert on public.notification_reads to authenticated;
-- notification_deliveries: sin permisos para clientes. La usará el envío de correos (service_role).

create policy notifications_select on public.notifications
  for select to authenticated
  using (
    (audience = 'platform' and (select private.is_super_admin()))
    or (
      audience = 'tenant'
      and tenant_id = (select private.current_tenant_id())
      and (select private.current_profile_role()) = 'tenant_admin'
    )
  );

create policy notification_reads_select on public.notification_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Solo puede marcar como leído un aviso que ya puede ver (el EXISTS respeta RLS).
create policy notification_reads_insert on public.notification_reads
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.notifications n where n.id = notification_id)
  );

-- ---------------------------------------------------------------------------
-- Logos del cliente: bucket público (se muestran a los hinchas), escritura
-- restringida a la carpeta del propio cliente y a planes con tenant_branding.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-logos', 'tenant-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create function private.in_own_logo_folder(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_profile_role() = 'tenant_admin'
     and (storage.foldername(p_path))[1] = private.current_tenant_id()::text
$$;

create function private.can_upload_logo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.in_own_logo_folder(p_path)
     and private.tenant_can_write(private.current_tenant_id())
     and private.feature_enabled(private.current_tenant_id(), 'tenant_branding')
$$;

create function private.can_delete_logo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.in_own_logo_folder(p_path)
     and private.tenant_can_write(private.current_tenant_id())
$$;

revoke all on function private.in_own_logo_folder(text) from public;
revoke all on function private.can_upload_logo(text) from public;
revoke all on function private.can_delete_logo(text) from public;
grant execute on function private.in_own_logo_folder(text) to authenticated;
grant execute on function private.can_upload_logo(text) to authenticated;
grant execute on function private.can_delete_logo(text) to authenticated;

create policy tenant_logos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tenant-logos'
    and ((select private.in_own_logo_folder(name)) or (select private.is_super_admin()))
  );

create policy tenant_logos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tenant-logos' and (select private.can_upload_logo(name)));

create policy tenant_logos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'tenant-logos' and (select private.can_upload_logo(name)))
  with check (bucket_id = 'tenant-logos' and (select private.can_upload_logo(name)));

create policy tenant_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tenant-logos'
    and ((select private.can_delete_logo(name)) or (select private.is_super_admin()))
  );
