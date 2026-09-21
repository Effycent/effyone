import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { CheckIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import {
  ACCESS_LABELS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  formatDateTimeIn,
  formatMoney,
} from "@/lib/billing/labels";
import { accessTone } from "@/lib/billing/tones";
import { requireTenantManagerPage } from "@/lib/tenant/panel";
import { requestUpgradeAction } from "./actions";

export const metadata: Metadata = { title: "Mi plan" };

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ feature?: string }>;
}) {
  const { slug } = await params;
  const { feature } = await searchParams;
  const panel = await requireTenantManagerPage(slug);
  const { overview, plans, catalog, planFeatures, tenant } = panel;

  const wanted = feature ? catalog.find((f) => f.feature_key === feature) : undefined;
  const wantedPlan = wanted
    ? plans
        .filter((p) => planFeatures.some((pf) => pf.plan_id === p.id && pf.feature_key === wanted.feature_key && pf.enabled))
        .sort((a, b) => a.price_cents - b.price_cents)[0]
    : undefined;

  const cell = (planId: string, featureKey: string, kind: "boolean" | "limit") => {
    const row = planFeatures.find((pf) => pf.plan_id === planId && pf.feature_key === featureKey);
    if (!row || !row.enabled) return <span className="text-asphalt-600">—</span>;
    if (kind === "limit") return <span className="font-medium tabular-nums">{row.limit_value ?? "Ilimitado"}</span>;
    return <CheckIcon className="mx-auto text-ok" />;
  };

  return (
    <>
      {wanted && wantedPlan && wantedPlan.id !== overview.plan_id ? (
        <p className="border-l-4 border-brand bg-asphalt-900 px-4 py-3 text-sm text-asphalt-200">
          Para usar <strong className="text-white">{wanted.name}</strong> necesitas el plan{" "}
          <strong className="text-white">{wantedPlan.name}</strong>. Puedes solicitarlo más abajo.
        </p>
      ) : null}

      <Panel title="Tu plan actual">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-5xl font-extrabold uppercase">{overview.plan_name}</span>
          <Badge tone={accessTone(overview.access_state)}>{ACCESS_LABELS[overview.access_state]}</Badge>
        </div>
        <p className="mt-2 text-sm text-asphalt-400">
          {overview.price_cents === 0
            ? "Gratis para siempre"
            : `${formatMoney(overview.price_cents, overview.currency)} al mes`}
          {overview.grace_ends_at
            ? ` · Regulariza antes del ${formatDateTimeIn(overview.grace_ends_at, tenant.timezone)}`
            : ""}
        </p>
      </Panel>

      <Panel title="Compara los planes" description="Lo que incluye cada plan. El tuyo aparece resaltado.">
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="w-1/3 pb-4 pr-4 align-bottom text-xs font-semibold uppercase tracking-widest text-asphalt-400">
                  Función
                </th>
                {plans.map((p) => (
                  <th
                    key={p.id}
                    className={`px-3 pb-4 text-center align-bottom ${p.id === overview.plan_id ? "border-t-4 border-brand bg-asphalt-800" : ""}`}
                  >
                    <span className="block font-display text-2xl font-extrabold uppercase">{p.name}</span>
                    <span className="block text-xs font-normal text-asphalt-400">
                      {p.price_cents === 0 ? "Gratis" : `${formatMoney(p.price_cents, p.currency)}/mes`}
                    </span>
                    {p.id === overview.plan_id ? <Badge tone="warn">Tu plan</Badge> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORY_ORDER.map((category) => {
                const items = catalog.filter((f) => f.category === category);
                if (items.length === 0) return null;
                return [
                  <tr key={`h-${category}`}>
                    <th
                      colSpan={plans.length + 1}
                      className="border-t border-asphalt-700 pb-1 pt-5 text-xs font-semibold uppercase tracking-widest text-asphalt-400"
                    >
                      {CATEGORY_LABELS[category]}
                    </th>
                  </tr>,
                  ...items.map((f) => (
                    <tr
                      key={f.feature_key}
                      className={`border-t border-asphalt-800 ${wanted?.feature_key === f.feature_key ? "bg-asphalt-800" : ""}`}
                    >
                      <td className="py-2.5 pr-4">
                        <span className="font-medium">{f.name}</span>
                        {f.availability === "coming_soon" ? <span className="ml-2 align-middle"><Badge>Próximamente</Badge></span> : null}
                        <span className="block text-xs text-asphalt-400">{f.benefit}</span>
                      </td>
                      {plans.map((p) => (
                        <td
                          key={p.id}
                          className={`px-3 py-2.5 text-center ${p.id === overview.plan_id ? "bg-asphalt-800" : ""}`}
                        >
                          {cell(p.id, f.feature_key, f.kind)}
                        </td>
                      ))}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {panel.canManage ? (
        <Panel
          title="Solicitar un cambio de plan"
          description="EffyOne recibe tu solicitud y te contacta para coordinar el cambio y el pago."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {plans
              .filter((p) => p.id !== overview.plan_id)
              .map((p) => (
                <div key={p.id} className="space-y-3 border border-asphalt-700 bg-asphalt-900 p-4">
                  <p className="font-display text-3xl font-extrabold uppercase">
                    {p.name}
                    <span className="ml-3 text-base font-medium normal-case text-asphalt-400">
                      {p.price_cents === 0 ? "Gratis" : `${formatMoney(p.price_cents, p.currency)}/mes`}
                    </span>
                  </p>
                  {p.description ? <p className="text-sm text-asphalt-200">{p.description}</p> : null}
                  <ActionForm action={requestUpgradeAction} submitLabel={`Solicitar ${p.name}`} pendingLabel="Enviando…" className="space-y-3">
                    <input type="hidden" name="plan_id" value={p.id} />
                    <TextField label="Mensaje (opcional)" name="message" maxLength={300} placeholder="Ej. Queremos usar vocalía online" />
                  </ActionForm>
                </div>
              ))}
          </div>
        </Panel>
      ) : null}
    </>
  );
}
