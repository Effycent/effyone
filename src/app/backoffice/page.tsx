import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requireSuperAdmin } from "@/lib/auth/session";
import { ACCESS_LABELS, STATUS_LABELS, formatDate, formatMoney } from "@/lib/billing/labels";
import { accessTone, statusTone } from "@/lib/billing/tones";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clientes" };

export default async function BackofficePage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const [{ data: tenants }, { data: profiles }] = await Promise.all([
    supabase.from("tenant_overview").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("tenant_id, role, is_active"),
  ]);

  const rows = tenants ?? [];
  const members = (profiles ?? []).filter((p) => p.role !== "super_admin");
  const usersByTenant = new Map<string, number>();
  for (const p of members) {
    if (p.tenant_id) usersByTenant.set(p.tenant_id, (usersByTenant.get(p.tenant_id) ?? 0) + 1);
  }

  const paying = rows.filter((t) => t.price_cents > 0 && t.subscription_status === "active");
  const monthly = paying.reduce((sum, t) => sum + t.price_cents, 0);
  const attention = rows.filter((t) => t.access_state !== "full").length;

  return (
    <>
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Clientes" value={String(rows.length)} />
        <Stat label="Usuarios activos" value={String(members.filter((m) => m.is_active).length)} />
        <Stat label="Ingreso mensual" value={formatMoney(monthly)} hint={`${paying.length} ${paying.length === 1 ? "plan de pago al día" : "planes de pago al día"}`} />
        <Stat label="Requieren atención" value={String(attention)} hint="En mora, suspendidos o cancelados" />
      </section>

      <section className="border border-asphalt-700 bg-asphalt-850">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-asphalt-700 px-5 py-4">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Clientes</h2>
          <Link
            href="/backoffice/clientes/nuevo"
            className="inline-flex h-11 items-center bg-brand px-5 font-display text-lg font-bold uppercase tracking-wide text-black hover:bg-brand-strong"
          >
            Nuevo cliente
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-sm text-asphalt-200">Todavía no hay clientes registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-asphalt-700 text-xs uppercase tracking-widest text-asphalt-400">
                  <th className="px-5 py-3 font-semibold">Cliente</th>
                  <th className="px-5 py-3 font-semibold">Plan</th>
                  <th className="px-5 py-3 font-semibold">Estado</th>
                  <th className="px-5 py-3 font-semibold">Acceso</th>
                  <th className="px-5 py-3 text-right font-semibold">Usuarios</th>
                  <th className="px-5 py-3 font-semibold">Alta</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-b border-asphalt-800 last:border-0 hover:bg-asphalt-800">
                    <td className="px-5 py-3">
                      <Link href={`/backoffice/clientes/${t.id}`} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                      <p className="text-xs text-asphalt-400">/c/{t.slug}</p>
                    </td>
                    <td className="px-5 py-3">
                      {t.plan_name}
                      <p className="text-xs text-asphalt-400">
                        {t.price_cents === 0 ? "Gratis" : `${formatMoney(t.price_cents, t.currency)}/mes`}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone(t.subscription_status)}>{STATUS_LABELS[t.subscription_status]}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={accessTone(t.access_state)}>{ACCESS_LABELS[t.access_state]}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{usersByTenant.get(t.id) ?? 0}</td>
                    <td className="px-5 py-3 text-asphalt-200">{formatDate(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-asphalt-700 bg-asphalt-850 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-asphalt-400">{label}</p>
      <p className="mt-2 font-display text-5xl font-extrabold leading-none tabular-nums">{value}</p>
      {hint ? <p className="mt-2 text-xs text-asphalt-400">{hint}</p> : null}
    </div>
  );
}
