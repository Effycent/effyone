import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { FeatureGate } from "@/components/feature-gate";
import { LockedFeature } from "@/components/locked-feature";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { UsageMeter } from "@/components/usage-meter";
import { ROLE_LABELS } from "@/lib/auth/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireTenantManagerPage, tenantPath, type TenantPanel } from "@/lib/tenant/panel";
import { addMemberAction, resetMemberPasswordAction, setMemberActiveAction } from "./actions";

export const metadata: Metadata = { title: "Equipo" };

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const panel = await requireTenantManagerPage(slug);
  const { tenant, ctx } = panel;

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at");

  // Los correos viven en Auth; los ids ya vienen filtrados por RLS.
  const admin = createAdminClient();
  const members = await Promise.all(
    (profiles ?? []).map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.id);
      return { ...p, email: data.user?.email ?? "—" };
    }),
  );

  const limit = panel.entitlements.get("max_admins");
  const activeAdmins = members.filter((m) => m.role === "tenant_admin" && m.is_active).length;
  const unlimited = limit?.unlimited ?? false;
  const maxAdmins = limit?.limit_value ?? 0;
  const atLimit = !unlimited && activeAdmins >= maxAdmins;
  const canEdit = panel.canManage && panel.canWrite;
  const nextPlan = planWithMoreAdmins(panel, maxAdmins);

  return (
    <>
      <Panel title="Administradores" description="Personas que pueden gestionar todo tu complejo.">
        <UsageMeter
          value={activeAdmins}
          limit={unlimited ? null : maxAdmins}
          label={`de ${maxAdmins} permitidos en tu plan`}
          unlimitedLabel="administradores activos (sin límite en tu plan)"
        />
      </Panel>

      <Panel title="Usuarios" description="Cada persona ingresa con su correo y una contraseña temporal.">
        <ul className="divide-y divide-asphalt-800">
          {members.map((m) => {
            const isSelf = m.id === ctx.userId;
            return (
              <li key={m.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{m.full_name}</span>
                  <span className="text-sm text-asphalt-400">{m.email}</span>
                  <Badge>{ROLE_LABELS[m.role]}</Badge>
                  {isSelf ? <Badge tone="ok">Tú</Badge> : null}
                  {m.is_active ? null : <Badge tone="danger">Inactivo</Badge>}
                  {m.must_change_password ? <Badge tone="warn">Contraseña temporal</Badge> : null}
                </div>
                {canEdit && !isSelf ? (
                  <div className="flex flex-wrap items-start gap-3">
                    <ActionForm
                      action={resetMemberPasswordAction}
                      submitLabel="Restablecer contraseña"
                      pendingLabel="Generando…"
                      variant="secondary"
                      compact
                      confirmMessage={`Se generará una contraseña temporal nueva para ${m.full_name}. ¿Continuar?`}
                      className="space-y-2"
                    >
                      <input type="hidden" name="user_id" value={m.id} />
                    </ActionForm>
                    <ActionForm
                      action={setMemberActiveAction}
                      submitLabel={m.is_active ? "Desactivar" : "Activar"}
                      variant={m.is_active ? "danger" : "secondary"}
                      compact
                      confirmMessage={m.is_active ? `${m.full_name} perderá el acceso de inmediato. ¿Continuar?` : undefined}
                      className="space-y-2"
                    >
                      <input type="hidden" name="user_id" value={m.id} />
                      <input type="hidden" name="active" value={m.is_active ? "false" : "true"} />
                    </ActionForm>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!panel.canWrite && panel.canManage ? (
          <p className="mt-4 text-sm text-asphalt-400">
            Tu cuenta está en solo lectura: no se pueden agregar ni modificar usuarios.
          </p>
        ) : null}
      </Panel>

      {panel.canManage && panel.canWrite ? (
        atLimit ? (
          <LockedFeature
            name="Más administradores"
            benefit={`Llegaste al máximo de tu plan (${maxAdmins}). Suma más personas que gestionen tu complejo.`}
            requiredPlanName={nextPlan?.name}
            upgradeHref={tenantPath(slug, "/plan")}
          />
        ) : (
          <Panel title="Agregar administrador">
            <ActionForm
              action={addMemberAction}
              submitLabel="Crear administrador"
              pendingLabel="Creando…"
              resetOnSuccess
            >
              <input type="hidden" name="role" value="tenant_admin" />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Nombre completo" name="full_name" required maxLength={120} />
                <TextField label="Correo" name="email" type="email" required autoCapitalize="none" />
              </div>
            </ActionForm>
          </Panel>
        )
      ) : null}

      {panel.canManage ? (
        <FeatureGate slug={slug} feature="online_match_sheet">
          <Panel
            title="Agregar operador"
            description="Los operadores llenan la vocalía de los partidos desde su celular."
          >
            <ActionForm
              action={addMemberAction}
              submitLabel="Crear operador"
              pendingLabel="Creando…"
              resetOnSuccess
            >
              <input type="hidden" name="role" value="operator" />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Nombre completo" name="full_name" required maxLength={120} />
                <TextField label="Correo" name="email" type="email" required autoCapitalize="none" />
              </div>
            </ActionForm>
          </Panel>
        </FeatureGate>
      ) : null}
    </>
  );
}

/** El plan activo más económico que permite más administradores que el actual. */
function planWithMoreAdmins(panel: TenantPanel, currentMax: number) {
  return (
    panel.plans
      .filter((plan) => {
        const row = panel.planFeatures.find((pf) => pf.plan_id === plan.id && pf.feature_key === "max_admins");
        return !!row && row.enabled && (row.limit_value === null || row.limit_value > currentMax);
      })
      .sort((a, b) => a.price_cents - b.price_cents)[0] ?? null
  );
}
