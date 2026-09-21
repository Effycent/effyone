import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { ROLE_LABELS } from "@/lib/auth/labels";
import { requireSuperAdmin } from "@/lib/auth/session";
import {
  ACCESS_LABELS,
  STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatMoney,
} from "@/lib/billing/labels";
import { accessTone, statusTone } from "@/lib/billing/tones";
import { COUNTRY_OPTIONS, TIMEZONES } from "@/lib/geo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation/backoffice";
import type { SubscriptionStatus } from "@/types/database";
import {
  createUserAction,
  purgeTenantAction,
  resetPasswordAction,
  setSubscriptionStatusAction,
  setTenantPlanAction,
  setUserActiveAction,
  updateTenantAction,
} from "../actions";

export const metadata: Metadata = { title: "Ficha del cliente" };

const STATUS_OPTIONS: SubscriptionStatus[] = ["active", "past_due", "suspended", "canceled"];

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [{ data: tenant }, { data: plans }, { data: users }, { data: events }, { data: settings }] =
    await Promise.all([
      supabase.from("tenant_overview").select("*").eq("id", id).maybeSingle(),
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("profiles").select("*").eq("tenant_id", id).order("created_at"),
      supabase
        .from("tenant_subscription_events")
        .select("*")
        .eq("tenant_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("platform_settings").select("*").single(),
    ]);
  if (!tenant) notFound();

  // Los correos viven en Auth, no en profiles.
  const admin = createAdminClient();
  const members = await Promise.all(
    (users ?? []).map(async (u) => {
      const { data } = await admin.auth.admin.getUserById(u.id);
      return { ...u, email: data.user?.email ?? "—" };
    }),
  );

  const planOptions = (plans ?? [])
    .filter((p) => p.is_active || p.id === tenant.plan_id)
    .map((p) => ({
      value: p.id,
      label: `${p.name} · ${p.price_cents === 0 ? "Gratis" : `${formatMoney(p.price_cents, p.currency)}/mes`}${p.is_active ? "" : " (inactivo)"}`,
    }));

  const isFree = tenant.price_cents === 0;
  const statusOptions = STATUS_OPTIONS.filter((s) => !(isFree && s === "past_due")).map((s) => ({
    value: s,
    label: STATUS_LABELS[s],
  }));

  const now = new Date();
  const purgeReady =
    tenant.subscription_status === "canceled" &&
    !!tenant.purge_eligible_at &&
    new Date(tenant.purge_eligible_at) <= now;

  return (
    <>
      <Link href="/backoffice" className="text-sm text-asphalt-400 hover:text-white">
        ← Volver a clientes
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight">{tenant.name}</h1>
        <Badge tone={statusTone(tenant.subscription_status)}>{STATUS_LABELS[tenant.subscription_status]}</Badge>
        <Badge tone={accessTone(tenant.access_state)}>{ACCESS_LABELS[tenant.access_state]}</Badge>
        <Link href={`/c/${tenant.slug}`} className="text-sm text-asphalt-200 underline underline-offset-4">
          /c/{tenant.slug}
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Suscripción" description="Los cambios rigen de inmediato, sin publicar nada.">
          <dl className="mb-6 divide-y divide-asphalt-800 text-sm">
            <Row label="Plan" value={`${tenant.plan_name} · ${isFree ? "Gratis" : `${formatMoney(tenant.price_cents, tenant.currency)}/mes`}`} />
            <Row label="Estado" value={STATUS_LABELS[tenant.subscription_status]} />
            <Row label="Acceso actual" value={ACCESS_LABELS[tenant.access_state]} />
            {tenant.past_due_since ? <Row label="En mora desde" value={formatDateTime(tenant.past_due_since)} /> : null}
            {tenant.grace_ends_at ? (
              <Row
                label={new Date(tenant.grace_ends_at) > now ? "La gracia termina" : "La gracia terminó"}
                value={formatDateTime(tenant.grace_ends_at)}
              />
            ) : null}
            {tenant.canceled_at ? <Row label="Cancelado el" value={formatDateTime(tenant.canceled_at)} /> : null}
            {tenant.purge_eligible_at ? (
              <Row label="Eliminable desde" value={formatDate(tenant.purge_eligible_at)} />
            ) : null}
          </dl>

          <div className="space-y-6">
            <ActionForm action={setTenantPlanAction} submitLabel="Cambiar plan" className="space-y-3">
              <input type="hidden" name="tenant_id" value={tenant.id} />
              <SelectField label="Plan" name="plan_id" defaultValue={tenant.plan_id} options={planOptions} />
              <TextField label="Nota (opcional)" name="note" maxLength={300} placeholder="Ej. Pagó el plan anual" />
            </ActionForm>

            <ActionForm
              action={setSubscriptionStatusAction}
              submitLabel="Aplicar estado"
              className="space-y-3"
              confirmMessage="¿Cambiar el estado de la suscripción de este cliente?"
            >
              <input type="hidden" name="tenant_id" value={tenant.id} />
              <SelectField
                label="Estado de la suscripción"
                name="status"
                defaultValue={tenant.subscription_status}
                options={statusOptions}
                hint={
                  isFree
                    ? "Plan gratuito: no entra en mora."
                    : "En mora inicia la cuenta de gracia. Suspendido y Cancelado dejan al cliente en solo lectura y ocultan su vista pública."
                }
              />
              <TextField label="Nota (opcional)" name="note" maxLength={300} placeholder="Ej. Transferencia recibida" />
            </ActionForm>
          </div>
          {settings ? (
            <p className="mt-4 text-xs text-asphalt-400">
              Días de gracia: {settings.grace_days} · Conservación tras cancelar: {settings.canceled_retention_days} días
              (se cambian en Ajustes).
            </p>
          ) : null}
        </Panel>

        <Panel title="Datos del cliente">
          <ActionForm action={updateTenantAction} submitLabel="Guardar datos" className="space-y-4">
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <TextField label="Nombre" name="name" defaultValue={tenant.name} required maxLength={120} />
            <TextField
              label="Dirección web"
              name="slug"
              defaultValue={tenant.slug}
              required
              maxLength={40}
              autoCapitalize="none"
              hint="Cambiarla rompe los enlaces que el cliente ya compartió."
            />
            <SelectField label="País" name="country" defaultValue={tenant.country} options={COUNTRY_OPTIONS} />
            <SelectField
              label="Zona horaria"
              name="timezone"
              defaultValue={tenant.timezone}
              options={TIMEZONES.map((z) => ({ value: z, label: z }))}
            />
          </ActionForm>
        </Panel>
      </div>

      <Panel title="Usuarios" description="Cada usuario pertenece a un solo cliente.">
        <ul className="divide-y divide-asphalt-800">
          {members.map((m) => (
            <li key={m.id} className="space-y-3 py-4 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{m.full_name}</span>
                <span className="text-sm text-asphalt-400">{m.email}</span>
                <Badge>{ROLE_LABELS[m.role]}</Badge>
                {m.is_active ? null : <Badge tone="danger">Inactivo</Badge>}
                {m.must_change_password ? <Badge tone="warn">Contraseña temporal</Badge> : null}
              </div>
              <div className="flex flex-wrap items-start gap-3">
                <ActionForm
                  action={resetPasswordAction}
                  submitLabel="Restablecer contraseña"
                  pendingLabel="Generando…"
                  variant="secondary"
                  compact
                  confirmMessage={`Se generará una contraseña temporal nueva para ${m.full_name}. ¿Continuar?`}
                  className="space-y-2"
                >
                  <input type="hidden" name="tenant_id" value={tenant.id} />
                  <input type="hidden" name="user_id" value={m.id} />
                </ActionForm>
                <ActionForm
                  action={setUserActiveAction}
                  submitLabel={m.is_active ? "Desactivar" : "Activar"}
                  variant={m.is_active ? "danger" : "secondary"}
                  compact
                  confirmMessage={m.is_active ? `${m.full_name} perderá el acceso de inmediato. ¿Continuar?` : undefined}
                  className="space-y-2"
                >
                  <input type="hidden" name="tenant_id" value={tenant.id} />
                  <input type="hidden" name="user_id" value={m.id} />
                  <input type="hidden" name="active" value={m.is_active ? "false" : "true"} />
                </ActionForm>
              </div>
            </li>
          ))}
          {members.length === 0 ? <li className="py-2 text-sm text-asphalt-200">Este cliente aún no tiene usuarios.</li> : null}
        </ul>

        <div className="mt-6 border-t border-asphalt-700 pt-6">
          <h3 className="mb-4 font-display text-xl font-bold uppercase tracking-wide">Agregar usuario</h3>
          <ActionForm action={createUserAction} submitLabel="Crear usuario" pendingLabel="Creando…" resetOnSuccess className="space-y-4">
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Nombre completo" name="full_name" required maxLength={120} />
              <TextField label="Correo" name="email" type="email" required autoCapitalize="none" />
              <SelectField
                label="Rol"
                name="role"
                defaultValue="tenant_admin"
                options={[
                  { value: "tenant_admin", label: "Administrador" },
                  { value: "operator", label: "Operador (vocalía online)" },
                ]}
              />
            </div>
            <p className="text-xs text-asphalt-400">
              El plan limita cuántos administradores activos puede tener el cliente, y los operadores solo existen en planes con vocalía online.
            </p>
          </ActionForm>
        </div>
      </Panel>

      <Panel title="Historial de suscripción" description="Registro inmutable de cambios de plan y estado.">
        {(events ?? []).length === 0 ? (
          <p className="text-sm text-asphalt-200">Sin cambios registrados.</p>
        ) : (
          <ul className="divide-y divide-asphalt-800 text-sm">
            {(events ?? []).map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <span>
                  <span className="font-medium">
                    {e.event_type === "plan_changed" ? "Plan" : "Estado"}:
                  </span>{" "}
                  {formatEventValue(e.event_type, e.from_value)} → {formatEventValue(e.event_type, e.to_value)}
                  {e.note ? <span className="text-asphalt-400"> · {e.note}</span> : null}
                </span>
                <span className="text-xs text-asphalt-400">{formatDateTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {tenant.subscription_status === "canceled" ? (
        <Panel title="Eliminar cliente" description="Borra para siempre al cliente, sus usuarios y todos sus datos.">
          {purgeReady ? (
            <ActionForm
              action={purgeTenantAction}
              submitLabel="Eliminar definitivamente"
              pendingLabel="Eliminando…"
              variant="danger"
              confirmMessage="Esta acción NO se puede deshacer. ¿Eliminar al cliente y todos sus datos?"
            >
              <input type="hidden" name="tenant_id" value={tenant.id} />
              <TextField
                label={`Escribe "${tenant.slug}" para confirmar`}
                name="confirm_slug"
                autoComplete="off"
                autoCapitalize="none"
              />
            </ActionForm>
          ) : (
            <p className="text-sm text-asphalt-200">
              Se podrá eliminar a partir del{" "}
              {tenant.purge_eligible_at ? formatDate(tenant.purge_eligible_at) : "fin del periodo de conservación"}. Hasta entonces sus datos se conservan y puedes reactivarlo cambiando el estado a &quot;Al día&quot;.
            </p>
          )}
        </Panel>
      ) : null}
    </>
  );
}

function formatEventValue(type: string, value: string | null): string {
  if (!value) return "—";
  return type === "status_changed" ? (STATUS_LABELS[value as SubscriptionStatus] ?? value) : value;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-asphalt-400">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
