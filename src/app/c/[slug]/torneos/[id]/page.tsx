import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Panel } from "@/components/ui/panel";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { UsageMeter } from "@/components/usage-meter";
import { formatDate } from "@/lib/billing/labels";
import { createClient } from "@/lib/supabase/server";
import { getTenantPanel, tenantPath } from "@/lib/tenant/panel";
import { idSchema } from "@/lib/validation/backoffice";
import type { TiebreakerCode, TournamentStatus } from "@/types/database";
import {
  addEntryAction,
  addRosterPlayerAction,
  quickCreateTeamAction,
  setEntryStatusAction,
  setRosterPlayerActiveAction,
  setTournamentStatusAction,
} from "../actions";
import { BracketPanel } from "./bracket-panel";
import { FixturePanel } from "./fixture-panel";

export const metadata: Metadata = { title: "Torneo" };

const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: "Borrador",
  scheduled: "Programado",
  in_progress: "En curso",
  finished: "Finalizado",
  archived: "Archivado",
};

const TIEBREAKER_LABELS: Record<TiebreakerCode, string> = {
  head_to_head: "Enfrentamiento directo",
  goal_diff: "Diferencia de gol",
  goals_for: "Goles a favor",
  wins: "Cantidad de victorias",
  fewer_cards: "Menos tarjetas",
};

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const panel = await getTenantPanel(slug);
  const canEdit = panel.canManage && panel.canWrite;

  const supabase = await createClient();
  const [{ data: tournament }, { data: stage }, { data: entries }, { data: teams }, { data: addons }] = await Promise.all([
    supabase.from("tournaments").select("*").eq("id", id).maybeSingle(),
    supabase.from("tournament_stages").select("*").eq("tournament_id", id).eq("stage_order", 1).maybeSingle(),
    supabase
      .from("tournament_entries")
      .select("*, teams(id, name, short_name)")
      .eq("tournament_id", id)
      .order("created_at"),
    supabase.from("teams").select("id, name").eq("tenant_id", panel.tenant.id).order("name"),
    supabase.from("tournament_addons").select("*, addons(code, name)").eq("tournament_id", id).eq("is_active", true),
  ]);
  if (!tournament) notFound();

  const entryIds = (entries ?? []).map((e) => e.id);
  const { data: rosterRows } = entryIds.length
    ? await supabase.from("roster_players").select("*").in("tournament_entry_id", entryIds).order("full_name")
    : { data: [] };

  const { data: matches } = stage
    ? await supabase
        .from("matches")
        .select("*")
        .eq("stage_id", stage.id)
        .order("round_number")
        .order("slot")
    : { data: [] };
  const teamNames = new Map<string, string>(
    (entries ?? []).map((e) => [e.id, (e as unknown as { teams: { name: string } | null }).teams?.name ?? "Equipo"]),
  );

  const rosterByEntry = new Map<string, typeof rosterRows>();
  for (const p of rosterRows ?? []) {
    const list = rosterByEntry.get(p.tournament_entry_id) ?? [];
    list.push(p);
    rosterByEntry.set(p.tournament_entry_id, list);
  }

  const registeredEntries = (entries ?? []).filter((e) => e.status === "registered");
  const enrolledTeamIds = new Set((entries ?? []).filter((e) => e.status === "registered").map((e) => e.team_id));
  const availableTeams = (teams ?? []).filter((t) => !enrolledTeamIds.has(t.id));
  const totalPlayers = (rosterRows ?? []).filter((p) => p.is_active).length;

  const teamLimit = panel.entitlements.get("max_teams_per_tournament");
  const playerLimit = panel.entitlements.get("max_players_per_tournament");

  return (
    <>
      <Link href={tenantPath(slug, "/torneos")} className="text-sm text-asphalt-400 hover:text-white">
        ← Volver a torneos
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight">{tournament.name}</h1>
        <Badge tone={tournament.status === "scheduled" || tournament.status === "in_progress" ? "ok" : "muted"}>
          {STATUS_LABELS[tournament.status]}
        </Badge>
        {!tournament.is_public ? <Badge>Privado</Badge> : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Estado del torneo" description="Solo cuenta contra tu límite de torneos activos cuando está Programado o En curso.">
          <p className="mb-4 text-sm text-asphalt-400">Creado el {formatDate(tournament.created_at)}</p>
          {canEdit ? (
            <div className="flex flex-wrap gap-3">
              {tournament.status === "draft" ? (
                <StatusButton status="scheduled" label="Publicar torneo" variant="primary" />
              ) : null}
              {tournament.status === "scheduled" ? (
                <>
                  <StatusButton status="draft" label="Volver a borrador" variant="secondary" />
                  <StatusButton status="finished" label="Marcar como finalizado" variant="secondary" />
                </>
              ) : null}
              {tournament.status === "finished" ? (
                <StatusButton status="archived" label="Archivar torneo" variant="danger" confirm="¿Archivar este torneo? Dejará de aparecer entre tus torneos activos." />
              ) : null}
              {tournament.status === "archived" ? <p className="text-sm text-asphalt-400">Este torneo está archivado.</p> : null}
            </div>
          ) : null}
          {!canEdit && panel.canManage ? (
            <p className="text-sm text-asphalt-400">Tu cuenta está en solo lectura: no se puede cambiar el estado.</p>
          ) : null}

          {stage ? (
            <dl className="mt-6 divide-y divide-asphalt-800 text-sm">
              <Row label="Formato" value={stage.format === "round_robin" ? "Liga" : "Eliminatoria directa"} />
              {stage.format === "round_robin" ? (
                <>
                  <Row label="Enfrentamientos" value={stage.round_robin_legs === 2 ? "Ida y vuelta" : "Una vuelta"} />
                  <Row label="Puntos" value={`Victoria ${stage.win_points} · Empate ${stage.draw_points} · Derrota ${stage.loss_points}`} />
                  <Row
                    label="Desempates"
                    value={(stage.tie_breakers ?? []).map((t) => TIEBREAKER_LABELS[t]).join(" → ") || "Sin definir"}
                  />
                </>
              ) : (
                <>
                  <Row label="Sorteo" value={stage.bracket_seeding === "manual" ? "Manual" : "Aleatorio"} />
                  <Row label="Tercer puesto" value={stage.third_place_match ? "Sí" : "No"} />
                </>
              )}
            </dl>
          ) : null}

          {(addons ?? []).length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {(addons ?? []).map((a) => (
                <Badge key={a.id} tone="warn">
                  {(a as unknown as { addons: { name: string } }).addons?.name ?? "Add-on"} activo
                </Badge>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel title="Cupos">
          <div className="space-y-6">
            <UsageMeter
              value={registeredEntries.length}
              limit={teamLimit?.unlimited ? null : (teamLimit?.limit_value ?? 0)}
              label={`de ${teamLimit?.limit_value ?? 0} equipos permitidos en tu plan`}
              unlimitedLabel="equipos inscritos (sin límite en tu plan)"
            />
            <UsageMeter
              value={totalPlayers}
              limit={playerLimit?.unlimited ? null : (playerLimit?.limit_value ?? 0)}
              label={`de ${playerLimit?.limit_value ?? 0} jugadores permitidos en tu plan`}
              unlimitedLabel="jugadores registrados (sin límite en tu plan)"
            />
          </div>
        </Panel>
      </div>

      <Panel title="Equipos inscritos" description="Abre cada equipo para gestionar su plantilla de jugadores.">
        {(entries ?? []).length === 0 ? (
          <p className="text-sm text-asphalt-200">Todavía no hay equipos inscritos.</p>
        ) : (
          <ul className="divide-y divide-asphalt-800">
            {(entries ?? []).map((entry) => {
              const team = (entry as unknown as { teams: { id: string; name: string; short_name: string | null } }).teams;
              const roster = rosterByEntry.get(entry.id) ?? [];
              return (
                <li key={entry.id} className="py-4 first:pt-0 last:pb-0">
                  <details className="group">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-3 marker:content-none">
                      <span className="font-display text-xl font-bold uppercase tracking-wide">{team?.name ?? "Equipo"}</span>
                      {entry.status === "withdrawn" ? <Badge tone="danger">Retirado</Badge> : null}
                      <span className="text-xs text-asphalt-400">{roster.filter((p) => p.is_active).length} jugador(es)</span>
                      <span className="ml-auto text-xs text-asphalt-400 group-open:hidden">Ver plantilla ▾</span>
                      <span className="ml-auto hidden text-xs text-asphalt-400 group-open:inline">Ocultar ▴</span>
                    </summary>

                    <div className="mt-4 space-y-4 border-t border-asphalt-800 pt-4">
                      {canEdit ? (
                        <ActionForm
                          action={setEntryStatusAction}
                          submitLabel={entry.status === "registered" ? "Retirar del torneo" : "Reinscribir"}
                          variant={entry.status === "registered" ? "danger" : "secondary"}
                          compact
                          className="space-y-2"
                        >
                          <input type="hidden" name="tournament_id" value={id} />
                          <input type="hidden" name="entry_id" value={entry.id} />
                          <input type="hidden" name="status" value={entry.status === "registered" ? "withdrawn" : "registered"} />
                        </ActionForm>
                      ) : null}

                      <ul className="divide-y divide-asphalt-800">
                        {roster.map((p) => (
                          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                            <span className="flex items-center gap-2">
                              {p.jersey_number !== null ? (
                                <span className="inline-flex h-6 w-6 items-center justify-center bg-asphalt-700 text-xs font-bold tabular-nums">
                                  {p.jersey_number}
                                </span>
                              ) : null}
                              {p.full_name}
                              {!p.is_active ? <Badge tone="danger">Baja</Badge> : null}
                            </span>
                            {canEdit ? (
                              <ActionForm
                                action={setRosterPlayerActiveAction}
                                submitLabel={p.is_active ? "Dar de baja" : "Reactivar"}
                                variant={p.is_active ? "danger" : "secondary"}
                                compact
                                className="space-y-2"
                              >
                                <input type="hidden" name="tournament_id" value={id} />
                                <input type="hidden" name="player_id" value={p.id} />
                                <input type="hidden" name="active" value={p.is_active ? "false" : "true"} />
                              </ActionForm>
                            ) : null}
                          </li>
                        ))}
                        {roster.length === 0 ? <li className="py-2 text-sm text-asphalt-200">Sin jugadores todavía.</li> : null}
                      </ul>

                      {canEdit && entry.status === "registered" ? (
                        <ActionForm
                          action={addRosterPlayerAction}
                          submitLabel="Agregar jugador"
                          compact
                          resetOnSuccess
                          className="grid gap-3 sm:grid-cols-[1fr_6rem_10rem_auto] sm:items-end"
                        >
                          <input type="hidden" name="tournament_id" value={id} />
                          <input type="hidden" name="entry_id" value={entry.id} />
                          <TextField label="Nombre" name="full_name" required maxLength={120} />
                          <TextField label="Dorsal" name="jersey_number" type="number" min={0} max={999} />
                          <TextField label="Documento (opcional)" name="document_id" maxLength={30} />
                        </ActionForm>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {stage?.format === "round_robin" ? (
        <FixturePanel
          slug={slug}
          tournamentId={id}
          stage={stage}
          matches={matches ?? []}
          teamNames={teamNames}
          registeredEntryIds={registeredEntries.map((e) => e.id)}
          timezone={panel.tenant.timezone}
          canEdit={canEdit && tournament.status !== "finished" && tournament.status !== "archived"}
        />
      ) : stage ? (
        <BracketPanel
          slug={slug}
          tournamentId={id}
          stage={stage}
          matches={matches ?? []}
          teamNames={teamNames}
          registeredTeams={registeredEntries.map((e) => ({ id: e.id, name: teamNames.get(e.id) ?? "Equipo" }))}
          timezone={panel.tenant.timezone}
          canEdit={canEdit && tournament.status !== "finished" && tournament.status !== "archived"}
        />
      ) : null}

      {canEdit ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Inscribir un club existente">
            {availableTeams.length === 0 ? (
              <p className="text-sm text-asphalt-200">
                {(teams ?? []).length === 0
                  ? "Aún no tienes clubes registrados. Crea uno nuevo aquí al lado, o revisa tus "
                  : "Todos tus clubes ya están inscritos en este torneo. Crea uno nuevo o revisa tus "}
                <Link href={tenantPath(slug, "/clubes")} className="underline decoration-brand underline-offset-4">
                  clubes
                </Link>
                .
              </p>
            ) : (
              <ActionForm action={addEntryAction} submitLabel="Inscribir" compact resetOnSuccess className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="tournament_id" value={id} />
                <SelectField
                  label="Club"
                  name="team_id"
                  options={availableTeams.map((t) => ({ value: t.id, label: t.name }))}
                  className="min-w-[14rem]"
                />
              </ActionForm>
            )}
          </Panel>

          <Panel title="Crear e inscribir un club nuevo">
            <ActionForm action={quickCreateTeamAction} submitLabel="Crear e inscribir" compact resetOnSuccess className="space-y-3">
              <input type="hidden" name="tournament_id" value={id} />
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                <TextField label="Nombre" name="name" required maxLength={80} />
                <TextField label="Sigla (opcional)" name="short_name" maxLength={12} />
              </div>
            </ActionForm>
          </Panel>
        </div>
      ) : null}
    </>
  );

  function StatusButton({
    status,
    label,
    variant,
    confirm,
  }: {
    status: TournamentStatus;
    label: string;
    variant: "primary" | "secondary" | "danger";
    confirm?: string;
  }) {
    return (
      <ActionForm action={setTournamentStatusAction} submitLabel={label} variant={variant} compact confirmMessage={confirm} className="space-y-2">
        <input type="hidden" name="tournament_id" value={id} />
        <input type="hidden" name="status" value={status} />
      </ActionForm>
    );
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-asphalt-400">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
