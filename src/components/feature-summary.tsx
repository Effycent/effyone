import Link from "next/link";
import { CheckIcon } from "@/components/icons";
import { FeatureGrid } from "@/components/feature-grid";
import { LockedFeature } from "@/components/locked-feature";
import {
  cheapestPlanWith,
  featureState,
  tenantPath,
  type TenantPanel,
} from "@/lib/tenant/panel";

const MAX_TEASERS = 3;

/**
 * Resumen compacto de las funciones del plan:
 *   1. lo que ya incluye (lista corta),
 *   2. hasta 3 funciones por desbloquear (las más cercanas: disponibles y del plan más económico),
 *   3. el detalle completo, plegado.
 * Las funciones bloqueadas no se ocultan, pero tampoco inundan la pantalla.
 */
export function FeatureSummary({ panel, slug }: { panel: TenantPanel; slug: string }) {
  const features = panel.catalog.filter((f) => f.kind === "boolean");
  const withState = features.map((f) => ({
    feature: f,
    state: featureState(panel.entitlements.get(f.feature_key), f),
  }));

  const included = withState.filter((x) => x.state === "active" || x.state === "coming_soon");
  const locked = withState.filter((x) => x.state === "locked" || x.state === "paused");

  // Solo el administrador ve ofertas de mejora; el operador no.
  const showUpsell = panel.canManage && locked.length > 0;
  const upgradeHref = panel.canManage ? tenantPath(slug, "/plan") : undefined;

  const teasers = [...locked]
    .sort((a, b) => {
      const soon = Number(a.feature.availability === "coming_soon") - Number(b.feature.availability === "coming_soon");
      if (soon !== 0) return soon;
      const priceA = cheapestPlanWith(panel, a.feature.feature_key)?.price_cents ?? Infinity;
      const priceB = cheapestPlanWith(panel, b.feature.feature_key)?.price_cents ?? Infinity;
      return priceA - priceB || a.feature.sort_order - b.feature.sort_order;
    })
    .slice(0, MAX_TEASERS);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-asphalt-400">
          Incluido en tu plan · {included.length}
        </h3>
        <ul className="flex flex-wrap gap-2">
          {included.map(({ feature, state }) => (
            <li
              key={feature.feature_key}
              className="flex items-center gap-2 border border-asphalt-700 bg-asphalt-900 px-3 py-1.5 text-sm"
              title={feature.benefit}
            >
              <CheckIcon className="h-4 w-4 text-ok" />
              {feature.name}
              {state === "coming_soon" ? (
                <span className="text-[10px] uppercase tracking-widest text-asphalt-400">Próximamente</span>
              ) : null}
            </li>
          ))}
          {included.length === 0 ? <li className="text-sm text-asphalt-400">Sin funciones adicionales.</li> : null}
        </ul>
      </section>

      {showUpsell ? (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-asphalt-400">
            Desbloquea al mejorar tu plan
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            {teasers.map(({ feature, state }) => (
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
            ))}
          </div>
          <p className="text-sm text-asphalt-400">
            {locked.length > teasers.length ? `Y ${locked.length - teasers.length} más. ` : ""}
            <Link href={tenantPath(slug, "/plan")} className="text-white underline decoration-brand underline-offset-4">
              Compara todos los planes
            </Link>
          </p>
        </section>
      ) : null}

      {showUpsell ? (
        <details className="group border border-asphalt-700 bg-asphalt-900">
          <summary className="cursor-pointer select-none px-4 py-3 font-display text-lg font-bold uppercase tracking-wide marker:text-brand">
            Ver todas las funciones por tema
          </summary>
          <div className="border-t border-asphalt-700 p-4">
            <FeatureGrid panel={panel} slug={slug} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
