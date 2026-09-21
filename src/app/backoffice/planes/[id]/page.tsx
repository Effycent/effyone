import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { centsToInput } from "@/lib/actions/form";
import { requireSuperAdmin } from "@/lib/auth/session";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/billing/labels";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation/backoffice";
import { updatePlanAction } from "../actions";
import { LimitField } from "./limit-field";

export const metadata: Metadata = { title: "Configurar plan" };

export default async function PlanEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [{ data: plan }, { data: catalog }, { data: features }, { count: tenantCount }] = await Promise.all([
    supabase.from("plans").select("*").eq("id", id).maybeSingle(),
    supabase.from("feature_catalog").select("*").order("sort_order"),
    supabase.from("plan_features").select("*").eq("plan_id", id),
    supabase.from("tenant_overview").select("id", { count: "exact", head: true }).eq("plan_id", id),
  ]);
  if (!plan) notFound();

  const byKey = new Map((features ?? []).map((f) => [f.feature_key, f]));

  return (
    <>
      <Link href="/backoffice/planes" className="text-sm text-asphalt-400 hover:text-white">
        ← Volver a planes
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight">{plan.name}</h1>
        <Badge>{plan.code}</Badge>
        {plan.is_default ? <Badge tone="warn">Por defecto</Badge> : null}
        <span className="text-sm text-asphalt-400">{tenantCount ?? 0} clientes con este plan</span>
      </header>

      <ActionForm action={updatePlanAction} submitLabel="Guardar plan" className="space-y-6">
        <input type="hidden" name="plan_id" value={plan.id} />

        <Panel title="Datos del plan" description="Los cambios de precio y de funciones rigen de inmediato.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nombre" name="name" defaultValue={plan.name} required maxLength={60} />
            <TextField
              label="Precio mensual (USD)"
              name="price"
              defaultValue={centsToInput(plan.price_cents)}
              inputMode="decimal"
              required
              hint="0 = plan gratuito: nunca entra en mora."
            />
            <div className="sm:col-span-2">
              <TextField label="Descripción" name="description" defaultValue={plan.description ?? ""} maxLength={300} />
            </div>
            <TextField label="Orden" name="sort_order" defaultValue={String(plan.sort_order)} inputMode="numeric" />
            <div className="flex items-end pb-3">
              <CheckboxField
                label={plan.is_default ? "Activo (el plan por defecto no se puede desactivar)" : "Activo: se puede asignar a clientes"}
                name="is_active"
                defaultChecked={plan.is_active}
              />
            </div>
          </div>
        </Panel>

        {CATEGORY_ORDER.map((category) => {
          const items = (catalog ?? []).filter((f) => f.category === category);
          if (items.length === 0) return null;
          return (
            <Panel key={category} title={CATEGORY_LABELS[category]}>
              <ul className="divide-y divide-asphalt-800">
                {items.map((feature) => {
                  const row = byKey.get(feature.feature_key);
                  return (
                    <li key={feature.feature_key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {feature.name}
                          {feature.availability === "coming_soon" ? <Badge>Próximamente</Badge> : null}
                          {feature.paused_when_readonly ? <Badge tone="warn">Se pausa en mora</Badge> : null}
                        </p>
                        <p className="text-sm text-asphalt-400">{feature.benefit}</p>
                      </div>
                      {feature.kind === "boolean" ? (
                        <CheckboxField
                          label="Incluida"
                          name={`f_${feature.feature_key}`}
                          defaultChecked={row?.enabled ?? false}
                          className="shrink-0"
                        />
                      ) : (
                        <LimitField
                          featureKey={feature.feature_key}
                          unit={feature.unit}
                          initialValue={row ? row.limit_value : 0}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          );
        })}
      </ActionForm>
    </>
  );
}
