import { CheckIcon } from "@/components/icons";
import { LockedFeature } from "@/components/locked-feature";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/billing/labels";
import {
  cheapestPlanWith,
  featureState,
  tenantPath,
  type TenantPanel,
} from "@/lib/tenant/panel";

/**
 * Todas las funciones de la plataforma agrupadas por tema: las del plan con
 * un visto, las que no incluye con candado y beneficio (nunca se ocultan).
 */
export function FeatureGrid({ panel, slug }: { panel: TenantPanel; slug: string }) {
  const upgradeHref = panel.canManage ? tenantPath(slug, "/plan") : undefined;

  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.filter((c) => c !== "limits").map((category) => {
        const items = panel.catalog.filter((f) => f.category === category);
        if (items.length === 0) return null;
        return (
          <section key={category} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-asphalt-400">
              {CATEGORY_LABELS[category]}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((feature) => {
                const state = featureState(panel.entitlements.get(feature.feature_key), feature);
                if (state === "locked" || state === "paused") {
                  return (
                    <LockedFeature
                      key={feature.feature_key}
                      name={feature.name}
                      benefit={feature.benefit}
                      requiredPlanName={cheapestPlanWith(panel, feature.feature_key)?.name}
                      paused={state === "paused"}
                      comingSoon={feature.availability === "coming_soon"}
                      upgradeHref={upgradeHref ? `${upgradeHref}?feature=${feature.feature_key}` : undefined}
                      emphasis="quiet"
                    />
                  );
                }
                return (
                  <div key={feature.feature_key} className="flex h-full items-start gap-3 border border-asphalt-700 bg-asphalt-850 p-4">
                    <CheckIcon className="mt-0.5 shrink-0 text-ok" />
                    <div className="space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-display text-xl font-bold uppercase tracking-wide">
                        {feature.name}
                        {state === "coming_soon" ? <Badge>Próximamente</Badge> : null}
                      </p>
                      <p className="text-sm text-asphalt-200">{feature.benefit}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
