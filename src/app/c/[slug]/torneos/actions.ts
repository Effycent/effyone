"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBool, getString } from "@/lib/actions/form";
import { dbErrorMessage, failState, firstIssue, okState, type ActionState } from "@/lib/actions/state";
import { createClient } from "@/lib/supabase/server";
import { requireTenantAdminAction } from "@/lib/tenant/guard";
import { idSchema } from "@/lib/validation/backoffice";
import { newTournamentSchema, rosterPlayerSchema, teamSchema } from "@/lib/validation/tournaments";
import type { TiebreakerCode, TournamentStatus } from "@/types/database";

function refreshList(slug: string) {
  revalidatePath(`/c/${slug}/torneos`);
}
function refreshDetail(slug: string, tournamentId: string) {
  revalidatePath(`/c/${slug}/torneos/${tournamentId}`);
}

const TIEBREAKER_KEYS: TiebreakerCode[] = ["head_to_head", "goal_diff", "goals_for", "wins", "fewer_cards"];

export async function createTournamentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const tieBreakers = TIEBREAKER_KEYS.filter((key) => getBool(formData, `tb_${key}`));

  const parsed = newTournamentSchema.safeParse({
    sport_id: getString(formData, "sport_id"),
    name: getString(formData, "name"),
    format: getString(formData, "format"),
    // El formulario pregunta "¿privado?"; la base de datos guarda "¿público?".
    is_public: !getBool(formData, "private"),
    round_robin_legs: getString(formData, "round_robin_legs") ? Number(getString(formData, "round_robin_legs")) : undefined,
    win_points: getString(formData, "win_points") || undefined,
    draw_points: getString(formData, "draw_points") || undefined,
    loss_points: getString(formData, "loss_points") || undefined,
    tie_breakers: tieBreakers.length > 0 ? tieBreakers : undefined,
    bracket_seeding: getString(formData, "bracket_seeding") || undefined,
    third_place_match: getBool(formData, "third_place_match"),
    discipline_yellow_for_suspension: getString(formData, "discipline_yellow_for_suspension"),
    discipline_suspension_matches: getString(formData, "discipline_suspension_matches") || "1",
    discipline_red_suspension_matches: getString(formData, "discipline_red_suspension_matches") || "1",
    discipline_cards_reset_between_stages: getBool(formData, "discipline_cards_reset_between_stages"),
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_tournament", {
    p_tenant_id: guard.tenantId,
    p_sport_id: v.sport_id,
    p_name: v.name,
    p_format: v.format,
    p_is_public: v.is_public,
    p_round_robin_legs: v.round_robin_legs,
    p_win_points: v.win_points,
    p_draw_points: v.draw_points,
    p_loss_points: v.loss_points,
    p_tie_breakers: v.tie_breakers,
    p_bracket_seeding: v.bracket_seeding,
    p_third_place_match: v.third_place_match,
    p_discipline_yellow_for_suspension: v.discipline_yellow_for_suspension,
    p_discipline_suspension_matches: v.discipline_suspension_matches,
    p_discipline_red_suspension_matches: v.discipline_red_suspension_matches,
    p_discipline_cards_reset_between_stages: v.discipline_cards_reset_between_stages,
  });
  if (error) return failState(dbErrorMessage(error, "No se pudo crear el torneo."));

  refreshList(guard.slug);
  redirect(`/c/${guard.slug}/torneos/${data}`);
}

export async function setTournamentStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const tournamentId = idSchema.safeParse(getString(formData, "tournament_id"));
  const status = getString(formData, "status") as TournamentStatus;
  if (!tournamentId.success || !["draft", "scheduled", "finished", "archived"].includes(status)) {
    return failState("Datos no válidos.");
  }

  const supabase = await createClient();

  if (status === "archived") {
    const { data: current } = await supabase
      .from("tournaments")
      .select("status")
      .eq("id", tournamentId.data)
      .single();
    if (current?.status !== "finished") {
      return failState("Solo se puede archivar un torneo ya finalizado.");
    }
  }

  const { data, error } = await supabase
    .from("tournaments")
    .update({ status, archived_at: status === "archived" ? new Date().toISOString() : null })
    .eq("id", tournamentId.data)
    .select("id");
  if (error) return failState(dbErrorMessage(error, "No se pudo cambiar el estado del torneo."));
  if (!data?.length) return failState("No se pudo cambiar el estado del torneo.");

  refreshList(guard.slug);
  refreshDetail(guard.slug, tournamentId.data);

  const labels: Record<string, string> = {
    draft: "El torneo volvió a borrador.",
    scheduled: "Torneo publicado. Ya cuenta dentro de tus torneos activos.",
    finished: "Torneo marcado como finalizado.",
    archived: "Torneo archivado.",
  };
  return okState(labels[status] ?? "Estado actualizado.");
}

export async function addEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const tournamentId = idSchema.safeParse(getString(formData, "tournament_id"));
  const teamId = idSchema.safeParse(getString(formData, "team_id"));
  if (!tournamentId.success || !teamId.success) return failState("Elige un equipo.");

  const supabase = await createClient();
  const { error } = await supabase.from("tournament_entries").insert({
    tournament_id: tournamentId.data,
    team_id: teamId.data,
    tenant_id: guard.tenantId,
  });
  if (error) return failState(dbErrorMessage(error, "No se pudo inscribir el equipo."));

  refreshDetail(guard.slug, tournamentId.data);
  return okState("Equipo inscrito.");
}

export async function setEntryStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const entryId = idSchema.safeParse(getString(formData, "entry_id"));
  const tournamentId = idSchema.safeParse(getString(formData, "tournament_id"));
  const rawStatus = getString(formData, "status");
  if (!entryId.success || !tournamentId.success || !["registered", "withdrawn"].includes(rawStatus)) {
    return failState("Datos no válidos.");
  }
  const status = rawStatus as "registered" | "withdrawn";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_entries")
    .update({ status })
    .eq("id", entryId.data)
    .select("id");
  if (error) return failState(dbErrorMessage(error, "No se pudo actualizar la inscripción."));
  if (!data?.length) return failState("No se encontró la inscripción.");

  refreshDetail(guard.slug, tournamentId.data);
  return okState(status === "registered" ? "Equipo reinscrito." : "Equipo retirado del torneo.");
}

export async function addRosterPlayerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const entryId = idSchema.safeParse(getString(formData, "entry_id"));
  const tournamentId = idSchema.safeParse(getString(formData, "tournament_id"));
  if (!entryId.success || !tournamentId.success) return failState("Datos no válidos.");

  const parsed = rosterPlayerSchema.safeParse({
    full_name: getString(formData, "full_name"),
    jersey_number: getString(formData, "jersey_number"),
    document_id: getString(formData, "document_id"),
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.from("roster_players").insert({
    tournament_entry_id: entryId.data,
    tenant_id: guard.tenantId,
    full_name: parsed.data.full_name,
    jersey_number: parsed.data.jersey_number,
    document_id: parsed.data.document_id,
  });
  if (error) return failState(dbErrorMessage(error, "No se pudo registrar el jugador."));

  refreshDetail(guard.slug, tournamentId.data);
  return okState("Jugador registrado.");
}

export async function setRosterPlayerActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const playerId = idSchema.safeParse(getString(formData, "player_id"));
  const tournamentId = idSchema.safeParse(getString(formData, "tournament_id"));
  const active = getString(formData, "active") === "true";
  if (!playerId.success || !tournamentId.success) return failState("Datos no válidos.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roster_players")
    .update({ is_active: active })
    .eq("id", playerId.data)
    .select("id");
  if (error) return failState(dbErrorMessage(error, "No se pudo actualizar al jugador."));
  if (!data?.length) return failState("No se encontró al jugador.");

  refreshDetail(guard.slug, tournamentId.data);
  return okState(active ? "Jugador reactivado." : "Jugador dado de baja.");
}

/** Alta rápida de club sin salir de la pantalla del torneo. */
export async function quickCreateTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const tournamentId = idSchema.safeParse(getString(formData, "tournament_id"));
  if (!tournamentId.success) return failState("Datos no válidos.");

  const parsed = teamSchema.safeParse({
    name: getString(formData, "name"),
    short_name: getString(formData, "short_name"),
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));

  const supabase = await createClient();
  const { data: team, error } = await supabase
    .from("teams")
    .insert({ tenant_id: guard.tenantId, name: parsed.data.name, short_name: parsed.data.short_name ?? null })
    .select("id")
    .single();
  if (error) return failState(dbErrorMessage(error, "No se pudo crear el equipo."));

  const { error: entryError } = await supabase
    .from("tournament_entries")
    .insert({ tournament_id: tournamentId.data, team_id: team.id, tenant_id: guard.tenantId });
  if (entryError) return failState(dbErrorMessage(entryError, "El equipo se creó, pero no se pudo inscribir."));

  refreshDetail(guard.slug, tournamentId.data);
  return okState(`"${parsed.data.name}" creado e inscrito.`);
}
