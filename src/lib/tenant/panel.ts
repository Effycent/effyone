import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { requireTenantAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type {
  Entitlement,
  FeatureCatalogItem,
  Plan,
  PlanFeature,
  TenantOverview,
} from "@/types/database";

export type FeatureState = "active" | "coming_soon" | "paused" | "locked";

/**
 * Todo lo que un panel de cliente necesita saber de su suscripción.
 * Se calcula UNA vez por petición (cache) y lo comparten layout, páginas y
 * componentes como FeatureGate.
 */
export type TenantPanel = Awaited<ReturnType<typeof loadTenantPanel>>;

async function loadTenantPanel(slug: string) {
  const { ctx, tenant, isSupportView } = await requireTenantAccess(slug);
  const supabase = await createClient();
  const isAdmin = ctx.profile.role === "tenant_admin";

  // Genera los avisos de mora que ya toquen (idempotente) antes de contarlos.
  if (isAdmin) await supabase.rpc("sync_my_notifications");

  const [overviewRes, entitlementsRes, catalogRes, plansRes, planFeaturesRes, unreadRes] =
    await Promise.all([
      supabase.from("tenant_overview").select("*").eq("id", tenant.id).single(),
      supabase.rpc("tenant_entitlements", { p_tenant_id: tenant.id }),
      supabase.from("feature_catalog").select("*").order("sort_order"),
      supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("plan_features").select("*"),
      isAdmin ? supabase.rpc("my_unread_notifications") : Promise.resolve({ data: 0 }),
    ]);

  const overview: TenantOverview | null = overviewRes.data;
  if (!overview) notFound();

  const entitlements = new Map<string, Entitlement>(
    (entitlementsRes.data ?? []).map((e) => [e.feature_key, e]),
  );
  const plans: Plan[] = plansRes.data ?? [];
  const currentPlan = plans.find((p) => p.id === overview.plan_id) ?? null;

  return {
    ctx,
    tenant,
    overview,
    isSupportView,
    /** Administrador del cliente: puede gestionar equipo, plan y perfil. */
    canManage: isAdmin,
    /** El acceso permite escribir (activo o en gracia). */
    canWrite: overview.access_state === "full" || overview.access_state === "grace",
    entitlements,
    catalog: (catalogRes.data ?? []) as FeatureCatalogItem[],
    plans,
    currentPlan,
    planFeatures: (planFeaturesRes.data ?? []) as PlanFeature[],
    unread: typeof unreadRes.data === "number" ? unreadRes.data : 0,
  };
}

export const getTenantPanel = cache(loadTenantPanel);

/** Páginas de gestión: las ve el administrador (y el Super Admin en vista de soporte). */
export async function requireTenantManagerPage(slug: string) {
  const panel = await getTenantPanel(slug);
  if (panel.ctx.profile.role === "operator") redirect(`/c/${slug}`);
  return panel;
}

export function featureState(entitlement: Entitlement | undefined, meta: FeatureCatalogItem): FeatureState {
  if (entitlement?.enabled) return meta.availability === "coming_soon" ? "coming_soon" : "active";
  if (entitlement?.paused) return "paused";
  return "locked";
}

/** El plan activo más económico que incluye una función (para el mensaje "Incluida desde…"). */
export function cheapestPlanWith(panel: TenantPanel, featureKey: string): Plan | null {
  const including = panel.plans
    .filter((plan) =>
      panel.planFeatures.some((pf) => pf.plan_id === plan.id && pf.feature_key === featureKey && pf.enabled),
    )
    .sort((a, b) => a.price_cents - b.price_cents);
  return including[0] ?? null;
}

export const tenantPath = (slug: string, path = "") => `/c/${slug}${path}`;
