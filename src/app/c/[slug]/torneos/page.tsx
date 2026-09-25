import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { UsageMeter } from "@/components/usage-meter";
import { requireTenantAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getTenantPanel, tenantPath } from "@/lib/tenant/panel";
import type { TournamentStatus } from "@/types/database";

export const metadata: Metadata = { title: "Torneos" };

const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: "Borrador",
  scheduled: "Programado",
  in_progress: "En curso",
  finished: "Finalizado",
  archived: "Archivado",
};

const STATUS_TONE: Record<TournamentStatus, "ok" | "warn" | "muted" | "danger"> = {
  draft: "muted",
  scheduled: "ok",
  in_progress: "ok",
  finished: "warn",
  archived: "muted",
};

const FORMAT_LABELS: Record<string, string> = {
  round_robin: "Liga",
  single_elimination: "Eliminatoria directa",
};

export default async function TournamentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Los operadores también pueden ver la lista (solo lectura); no requiere requireTenantManagerPage.
  const { tenant, isSupportView, ctx } = await requireTenantAccess(slug);
  const canManage = ctx.profile.role === "tenant_admin" || isSupportView;

  const supabase = await createClient();
  const { data: tournaments } = await supabase
    .from("tournament_overview")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  const rows = tournaments ?? [];
  const activeCount = rows.filter((t) => t.status === "scheduled" || t.status === "in_progress").length;

  let usageMeters: React.ReactNode = null;
  if (canManage) {
    const panel = await getTenantPanel(slug);
    const activeLimit = panel.entitlements.get("max_active_tournaments");
    const sportLimit = panel.entitlements.get("max_sport_types");
    const activeSports = new Set(rows.filter((t) => t.status !== "finished" && t.status !== "archived").map((t) => t.sport_code)).size;
    usageMeters = (
      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="Torneos activos">
          <UsageMeter
            value={activeCount}
            limit={activeLimit?.unlimited ? null : (activeLimit?.limit_value ?? 0)}
            label={`de ${activeLimit?.limit_value ?? 0} permitidos en tu plan`}
            unlimitedLabel="torneos activos (sin límite en tu plan)"
          />
        </Panel>
        <Panel title="Tipos de deporte en uso">
          <UsageMeter
            value={activeSports}
            limit={sportLimit?.unlimited ? null : (sportLimit?.limit_value ?? 0)}
            label={`de ${sportLimit?.limit_value ?? 0} permitidos en tu plan`}
            unlimitedLabel="deportes distintos (sin límite en tu plan)"
          />
        </Panel>
      </div>
    );
  }

  return (
    <>
      {usageMeters}

      <Panel
        title="Torneos"
        aside={
          canManage ? (
            <Link
              href={tenantPath(slug, "/torneos/nuevo")}
              className="inline-flex h-11 items-center bg-brand px-5 font-display text-lg font-bold uppercase tracking-wide text-black hover:bg-brand-strong"
            >
              Nuevo torneo
            </Link>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-asphalt-200">Todavía no hay torneos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-asphalt-700 text-xs uppercase tracking-widest text-asphalt-400">
                  <th className="px-3 py-3 font-semibold">Torneo</th>
                  <th className="px-3 py-3 font-semibold">Deporte</th>
                  <th className="px-3 py-3 font-semibold">Formato</th>
                  <th className="px-3 py-3 font-semibold">Estado</th>
                  <th className="px-3 py-3 text-right font-semibold">Equipos</th>
                  <th className="px-3 py-3 text-right font-semibold">Jugadores</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-b border-asphalt-800 last:border-0 hover:bg-asphalt-800">
                    <td className="px-3 py-3">
                      <Link href={tenantPath(slug, `/torneos/${t.id}`)} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                      {!t.is_public ? <Badge tone="muted">Privado</Badge> : null}
                    </td>
                    <td className="px-3 py-3">{t.sport_name}</td>
                    <td className="px-3 py-3">{t.format ? FORMAT_LABELS[t.format] : "—"}</td>
                    <td className="px-3 py-3">
                      <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABELS[t.status]}</Badge>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{t.teams_count}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{t.players_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
