"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBool, getString } from "@/lib/actions/form";
import { dbErrorMessage, failState, firstIssue, okState, type ActionState } from "@/lib/actions/state";
import { createClient } from "@/lib/supabase/server";
import { requireTenantAdminAction } from "@/lib/tenant/guard";
import { idSchema } from "@/lib/validation/backoffice";

const generateSchema = z.object({
  stage_id: idSchema,
  tournament_id: idSchema,
  first_date: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de inicio no es válida.")])
    .transform((v) => (v === "" ? null : v)),
  days_between_rounds: z.coerce
    .number("Escribe los días entre jornadas.")
    .int("Los días entre jornadas deben ser un número entero.")
    .min(1, "Mínimo 1 día entre jornadas.")
    .max(60, "Máximo 60 días entre jornadas."),
  kickoff_time: z.string().regex(/^\d{2}:\d{2}$/, "La hora de inicio no es válida."),
  shuffle: z.boolean(),
});

function refresh(slug: string, tournamentId: string) {
  revalidatePath(`/c/${slug}/torneos/${tournamentId}`);
  revalidatePath(`/c/${slug}/torneos`);
}

export async function generateFixtureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const parsed = generateSchema.safeParse({
    stage_id: getString(formData, "stage_id"),
    tournament_id: getString(formData, "tournament_id"),
    first_date: getString(formData, "first_date"),
    days_between_rounds: getString(formData, "days_between_rounds") || "7",
    kickoff_time: getString(formData, "kickoff_time") || "15:00",
    shuffle: getBool(formData, "shuffle"),
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));
  const v = parsed.data;

  // Toda la lógica y las validaciones (plan, permisos, bloqueo) viven en la función SQL.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_round_robin_fixture", {
    p_stage_id: v.stage_id,
    p_first_date: v.first_date,
    p_days_between_rounds: v.days_between_rounds,
    p_kickoff_time: v.kickoff_time,
    p_shuffle: v.shuffle,
  });
  if (error) return failState(dbErrorMessage(error, "No se pudo generar el calendario."));

  refresh(guard.slug, v.tournament_id);
  return okState(`Calendario generado: ${data} partidos.`);
}

const bracketSchema = generateSchema.omit({ shuffle: true }).extend({
  seeding: z.enum(["random", "manual"]),
  third_place: z.boolean(),
  slot_count: z.coerce.number().int().min(2).max(64),
});

export async function generateBracketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const parsed = bracketSchema.safeParse({
    stage_id: getString(formData, "stage_id"),
    tournament_id: getString(formData, "tournament_id"),
    first_date: getString(formData, "first_date"),
    days_between_rounds: getString(formData, "days_between_rounds") || "7",
    kickoff_time: getString(formData, "kickoff_time") || "15:00",
    seeding: getString(formData, "seeding") || "random",
    third_place: getBool(formData, "third_place"),
    slot_count: getString(formData, "slot_count") || "2",
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));
  const v = parsed.data;

  // Cruces manuales: una posición por lugar de la primera ronda ("" = lugar libre).
  let manualSlots: (string | null)[] | undefined;
  if (v.seeding === "manual") {
    manualSlots = [];
    for (let i = 1; i <= v.slot_count; i++) {
      const raw = getString(formData, `slot_${i}`);
      if (raw === "") {
        manualSlots.push(null);
        continue;
      }
      if (!idSchema.safeParse(raw).success) return failState("Uno de los equipos elegidos no es válido.");
      manualSlots.push(raw);
    }
    const chosen = manualSlots.filter((s): s is string => s !== null);
    if (new Set(chosen).size !== chosen.length) return failState("Un mismo equipo está elegido en más de un lugar.");
  }

  // Toda la lógica y las validaciones (plan, permisos, bloqueo, cruces) viven en la función SQL.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_single_elimination_bracket", {
    p_stage_id: v.stage_id,
    p_first_date: v.first_date,
    p_days_between_rounds: v.days_between_rounds,
    p_kickoff_time: v.kickoff_time,
    p_seeding: v.seeding,
    p_manual_slots: manualSlots ?? null,
    p_third_place: v.third_place,
  });
  if (error) return failState(dbErrorMessage(error, "No se pudo generar la llave."));

  refresh(guard.slug, v.tournament_id);
  return okState(`Llave generada: ${data} partidos.`);
}

export async function clearFixtureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const stageId = idSchema.safeParse(getString(formData, "stage_id"));
  const tournamentId = idSchema.safeParse(getString(formData, "tournament_id"));
  if (!stageId.success || !tournamentId.success) return failState("Datos no válidos.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_stage_fixture", { p_stage_id: stageId.data });
  if (error) return failState(dbErrorMessage(error, "No se pudo borrar el calendario."));

  refresh(guard.slug, tournamentId.data);
  return okState("Calendario borrado.");
}

export async function setMatchScheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const matchId = idSchema.safeParse(getString(formData, "match_id"));
  const tournamentId = idSchema.safeParse(getString(formData, "tournament_id"));
  if (!matchId.success || !tournamentId.success) return failState("Datos no válidos.");

  const raw = getString(formData, "scheduled_local");
  if (raw !== "" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return failState("La fecha y hora no son válidas.");
  const venue = getString(formData, "venue");
  if (venue.length > 120) return failState("La sede admite hasta 120 caracteres.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_match_schedule", {
    p_match_id: matchId.data,
    p_local_time: raw === "" ? null : `${raw}:00`,
    p_venue: venue || null,
  });
  if (error) return failState(dbErrorMessage(error, "No se pudo guardar el partido."));

  refresh(guard.slug, tournamentId.data);
  return okState("Partido guardado.");
}
