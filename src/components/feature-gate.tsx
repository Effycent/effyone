import type { ReactNode } from "react";
import { CheckIcon } from "@/components/icons";
import { LockedFeature } from "@/components/locked-feature";
import { Badge } from "@/components/ui/badge";
import { cheapestPlanWith, featureState, getTenantPanel, tenantPath } from "@/lib/tenant/panel";

type Props = {
  /** Slug del cliente (el de la URL /c/[slug]). */
  slug: string;
  /** feature_key del catálogo, ej. "tenant_branding". */
  feature: string;
  children: ReactNode;
};

/**
 * Muestra su contenido solo si el plan del cliente incluye la función.
 * Si no, muestra un candado con el beneficio y un botón "Mejorar plan".
 * La decisión sale de tenant_entitlements (base de datos), la MISMA fuente que
 * usan las políticas de seguridad: la interfaz solo la refleja, nunca decide sola.
 */
export async function FeatureGate({ slug, feature, children }: Props) {
  const panel = await getTenantPanel(slug);
  const meta = panel.catalog.find((f) => f.feature_key === feature);
  if (!meta) throw new Error(`FeatureGate: la función "${feature}" no existe en el catálogo.`);

  const state = featureState(panel.entitlements.get(feature), meta);

  if (state === "active") return <>{children}</>;

  if (state === "coming_soon") {
    return (
      <div className="flex items-start gap-3 border border-asphalt-700 bg-asphalt-900 p-4">
        <CheckIcon className="mt-0.5 shrink-0 text-ok" />
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-display text-xl font-bold uppercase tracking-wide">
            {meta.name}
            <Badge>Próximamente</Badge>
          </p>
          <p className="text-sm text-asphalt-200">{meta.benefit}</p>
          <p className="text-xs text-asphalt-400">Ya está incluida en tu plan; la activaremos en cuanto esté lista.</p>
        </div>
      </div>
    );
  }

  return (
    <LockedFeature
      name={meta.name}
      benefit={meta.benefit}
      requiredPlanName={cheapestPlanWith(panel, feature)?.name}
      paused={state === "paused"}
      comingSoon={meta.availability === "coming_soon"}
      upgradeHref={panel.canManage ? `${tenantPath(slug, "/plan")}?feature=${feature}` : undefined}
    />
  );
}
