"use server";

import { revalidatePath } from "next/cache";
import { getString } from "@/lib/actions/form";
import { dbErrorMessage, failState, firstIssue, okState, type ActionState } from "@/lib/actions/state";
import { createClient } from "@/lib/supabase/server";
import { requireTenantAdminAction } from "@/lib/tenant/guard";
import { idSchema } from "@/lib/validation/backoffice";
import { teamSchema } from "@/lib/validation/tournaments";

export async function createTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const parsed = teamSchema.safeParse({
    name: getString(formData, "name"),
    short_name: getString(formData, "short_name"),
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase
    .from("teams")
    .insert({ tenant_id: guard.tenantId, name: parsed.data.name, short_name: parsed.data.short_name ?? null });
  if (error) return failState(dbErrorMessage(error, "No se pudo crear el equipo."));

  revalidatePath(`/c/${guard.slug}/clubes`);
  return okState("Equipo creado.");
}

export async function updateTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const teamId = idSchema.safeParse(getString(formData, "team_id"));
  if (!teamId.success) return failState("Equipo no válido.");

  const parsed = teamSchema.safeParse({
    name: getString(formData, "name"),
    short_name: getString(formData, "short_name"),
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .update({ name: parsed.data.name, short_name: parsed.data.short_name ?? null })
    .eq("id", teamId.data)
    .select("id");
  if (error) return failState(dbErrorMessage(error, "No se pudo guardar el equipo."));
  if (!data?.length) return failState("No se encontró el equipo.");

  revalidatePath(`/c/${guard.slug}/clubes`);
  return okState("Equipo actualizado.");
}
