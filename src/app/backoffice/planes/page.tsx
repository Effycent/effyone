import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { centsToInput } from "@/lib/actions/form";
import { requireSuperAdmin } from "@/lib/auth/session";
import { formatMoney } from "@/lib/billing/labels";
import { createClient } from "@/lib/supabase/server";
import { createPlanAction, updateAddonAction } from "./actions";

export const metadata: Metadata = { title: "Planes" };

export default async function PlansPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const [{ data: plans }, { data: features }, { data: catalog }, { data: tenants }, { data: addons }] =
    await Promise.all([
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("plan_features").select("*"),
      supabase.from("feature_catalog").select("*").eq("category", "limits").order("sort_order"),
      supabase.from("tenant_overview").select("plan_id"),
      supabase.from("addons").select("*").order("created_at"),
    ]);

  const tenantsByPlan = new Map<string, number>();
  for (const t of tenants ?? []) tenantsByPlan.set(t.plan_id, (tenantsByPlan.get(t.plan_id) ?? 0) + 1);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(plans ?? []).map((plan) => (
          <article key={plan.id} className="flex flex-col border border-asphalt-700 bg-asphalt-850">
            <header className="space-y-2 border-b border-asphalt-700 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight">{plan.name}</h2>
                {plan.is_default ? <Badge tone="warn">Por defecto</Badge> : null}
                {plan.is_active ? null : <Badge tone="danger">Inactivo</Badge>}
              </div>
              <p className="font-display text-4xl font-extrabold tabular-nums">
                {plan.price_cents === 0 ? "Gratis" : formatMoney(plan.price_cents, plan.currency)}
                {plan.price_cents === 0 ? null : <span className="text-base font-medium text-asphalt-400"> /mes</span>}
              </p>
              {plan.description ? <p className="text-sm text-asphalt-200">{plan.description}</p> : null}
            </header>
            <dl className="flex-1 divide-y divide-asphalt-800 px-5 text-sm">
              {(catalog ?? []).map((f) => {
                const row = (features ?? []).find((x) => x.plan_id === plan.id && x.feature_key === f.feature_key);
                return (
                  <div key={f.feature_key} className="flex justify-between gap-3 py-2">
                    <dt className="text-asphalt-400">{f.name}</dt>
                    <dd className="font-medium tabular-nums">{row ? (row.limit_value ?? "Ilimitado") : "—"}</dd>
                  </div>
                );
              })}
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-asphalt-400">Clientes con este plan</dt>
                <dd className="font-medium tabular-nums">{tenantsByPlan.get(plan.id) ?? 0}</dd>
              </div>
            </dl>
            <footer className="p-5">
              <Link
                href={`/backoffice/planes/${plan.id}`}
                className="inline-flex h-11 w-full items-center justify-center border border-asphalt-600 font-display text-lg font-bold uppercase tracking-wide hover:border-asphalt-400 hover:bg-asphalt-800"
              >
                Configurar plan
              </Link>
            </footer>
          </article>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Add-ons" description="Servicios extra que el Super Admin asigna por torneo.">
          <ul className="divide-y divide-asphalt-800">
            {(addons ?? []).map((addon) => (
              <li key={addon.id} className="py-4 first:pt-0 last:pb-0">
                <ActionForm action={updateAddonAction} submitLabel="Guardar add-on" compact className="space-y-3">
                  <input type="hidden" name="addon_id" value={addon.id} />
                  <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                    <TextField label="Nombre" name="name" defaultValue={addon.name} required maxLength={80} />
                    <TextField
                      label={addon.billing_unit === "tournament_month" ? "USD / torneo / mes" : "USD / mes"}
                      name="price"
                      defaultValue={centsToInput(addon.price_cents)}
                      inputMode="decimal"
                      required
                    />
                  </div>
                  {addon.description ? <p className="text-xs text-asphalt-400">{addon.description}</p> : null}
                  <CheckboxField label="Disponible para contratar" name="is_active" defaultChecked={addon.is_active} />
                </ActionForm>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Nuevo plan" description="Se crea inactivo; luego defines sus funciones y lo activas.">
          <ActionForm action={createPlanAction} submitLabel="Crear plan" resetOnSuccess className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Nombre" name="name" required maxLength={60} placeholder="Platino" />
              <TextField
                label="Código"
                name="code"
                required
                maxLength={30}
                autoCapitalize="none"
                placeholder="platinum"
                hint="Identificador interno. No se puede cambiar."
              />
              <TextField label="Precio mensual (USD)" name="price" required inputMode="decimal" defaultValue="0.00" />
              <TextField label="Orden" name="sort_order" inputMode="numeric" defaultValue="40" />
            </div>
            <TextField label="Descripción" name="description" maxLength={300} />
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
