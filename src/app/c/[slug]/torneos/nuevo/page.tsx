import type { Metadata } from "next";
import Link from "next/link";
import { LockedFeature } from "@/components/locked-feature";
import { Panel } from "@/components/ui/panel";
import { cheapestPlanWith, requireTenantManagerPage, tenantPath } from "@/lib/tenant/panel";
import { createClient } from "@/lib/supabase/server";
import { NewTournamentForm } from "./new-tournament-form";

export const metadata: Metadata = { title: "Nuevo torneo" };

export default async function NewTournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const panel = await requireTenantManagerPage(slug);

  const supabase = await createClient();
  const { data: sports } = await supabase.from("sports").select("id, name").eq("is_active", true).order("name");

  const activeLimit = panel.entitlements.get("max_active_tournaments");
  const sportLimit = panel.entitlements.get("max_sport_types");

  return (
    <>
      <Link href={tenantPath(slug, "/torneos")} className="text-sm text-asphalt-400 hover:text-white">
        ← Volver a torneos
      </Link>

      {!panel.canWrite ? (
        <Panel title="Nuevo torneo">
          <p className="text-sm text-asphalt-200">
            Tu cuenta está en solo lectura. Regulariza tu pago para crear torneos.
          </p>
        </Panel>
      ) : (sports ?? []).length === 0 ? (
        <Panel title="Nuevo torneo">
          <p className="text-sm text-asphalt-200">Todavía no hay deportes disponibles. Contacta a EffyOne.</p>
        </Panel>
      ) : (
        <Panel
          title="Nuevo torneo"
          description="Nace en borrador. Cuando esté listo, lo publicas desde su ficha y ahí sí cuenta contra tu límite de torneos activos."
        >
          <NewTournamentForm
            sports={(sports ?? []).map((s) => ({ value: s.id, label: s.name }))}
            canGoPrivate={panel.entitlements.get("private_tournaments")?.enabled ?? false}
          />
        </Panel>
      )}

      {activeLimit && !activeLimit.unlimited ? (
        <p className="text-xs text-asphalt-400">
          Torneos activos (programados o en curso) permitidos en tu plan: {activeLimit.limit_value}. Los
          borradores no cuentan.
        </p>
      ) : null}
      {sportLimit && !sportLimit.unlimited ? (
        <p className="text-xs text-asphalt-400">
          Tipos de deporte distintos entre tus torneos no finalizados: {sportLimit.limit_value}.
        </p>
      ) : null}
      {!panel.entitlements.get("private_tournaments")?.enabled ? (
        <LockedFeature
          name="Torneos privados"
          benefit="Decide qué torneos puede ver el público."
          requiredPlanName={cheapestPlanWith(panel, "private_tournaments")?.name}
          comingSoon={panel.catalog.find((f) => f.feature_key === "private_tournaments")?.availability === "coming_soon"}
          upgradeHref={tenantPath(slug, "/plan")}
          emphasis="quiet"
        />
      ) : null}
    </>
  );
}
