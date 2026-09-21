import type { Metadata } from "next";
import Link from "next/link";
import { FeatureSummary } from "@/components/feature-summary";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { ROLE_LABELS } from "@/lib/auth/labels";
import { ACCESS_LABELS, formatMoney } from "@/lib/billing/labels";
import { accessTone } from "@/lib/billing/tones";
import { getTenantPanel, tenantPath } from "@/lib/tenant/panel";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Resumen" };

export default async function TenantHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const panel = await getTenantPanel(slug);
  const { tenant, overview } = panel;

  // RLS: un Administrador ve a todo su equipo; un Operador solo a sí mismo.
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("tenant_id", tenant.id)
    .order("full_name");

  const limits = panel.catalog.filter((f) => f.kind === "limit");
  const activeAdmins = (members ?? []).filter((m) => m.role === "tenant_admin" && m.is_active).length;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Tu plan"
          aside={
            panel.canManage ? (
              <Link href={tenantPath(slug, "/plan")} className="text-sm underline decoration-brand underline-offset-4">
                Ver planes
              </Link>
            ) : null
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="font-display text-4xl font-extrabold uppercase">{overview.plan_name}</span>
            <Badge tone={accessTone(overview.access_state)}>{ACCESS_LABELS[overview.access_state]}</Badge>
          </div>
          <p className="mb-4 text-sm text-asphalt-400">
            {overview.price_cents === 0
              ? "Gratis para siempre"
              : `${formatMoney(overview.price_cents, overview.currency)} al mes`}
          </p>
          <dl className="divide-y divide-asphalt-800 text-sm">
            {limits.map((f) => {
              const e = panel.entitlements.get(f.feature_key);
              const value = e?.unlimited ? "Ilimitado" : String(e?.limit_value ?? 0);
              const usage = f.feature_key === "max_admins" ? `${activeAdmins} de ` : "hasta ";
              return (
                <div key={f.feature_key} className="flex items-baseline justify-between gap-3 py-2.5">
                  <dt className="text-asphalt-400">{f.name}</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {e?.unlimited ? value : `${usage}${value}`}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Panel>

        <Panel title="Complejo">
          <dl className="divide-y divide-asphalt-800 text-sm">
            <Row label="Nombre" value={tenant.name} />
            <Row label="Dirección" value={`/c/${tenant.slug}`} />
            <Row label="País" value={tenant.country} />
            <Row label="Zona horaria" value={tenant.timezone} />
          </dl>
        </Panel>

        <Panel
          title="Equipo"
          aside={<span className="text-xs uppercase tracking-widest text-asphalt-400">{members?.length ?? 0} usuarios</span>}
        >
          <ul className="divide-y divide-asphalt-800">
            {(members ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0">
                <span className="font-medium">{m.full_name}</span>
                <span className="flex items-center gap-3">
                  {m.is_active ? null : <Badge tone="danger">Inactivo</Badge>}
                  <span className="text-xs uppercase tracking-widest text-asphalt-400">{ROLE_LABELS[m.role]}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Funciones de tu plan">
        <FeatureSummary panel={panel} slug={slug} />
      </Panel>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-asphalt-400">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
