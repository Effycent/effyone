"use server";

import { revalidatePath } from "next/cache";
import { getBool, getString } from "@/lib/actions/form";
import { dbErrorMessage, failState, firstIssue, okState, type ActionState } from "@/lib/actions/state";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation/backoffice";
import { newSportSchema } from "@/lib/validation/tournaments";

// Estas acciones escriben con la SESIÓN del Super Admin: la política RLS de
// sports es la que autoriza, no la clave de servidor.

function refresh() {
  revalidatePath("/backoffice/deportes");
}

export async function createSportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const parsed = newSportSchema.safeParse({
    code: getString(formData, "code"),
    name: getString(formData, "name"),
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.from("sports").insert(parsed.data);
  if (error) return failState(dbErrorMessage(error, "No se pudo crear el deporte."));

  refresh();
  return okState(`"${parsed.data.name}" ya está disponible para todos los clientes.`);
}

export async function updateSportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const id = idSchema.safeParse(getString(formData, "sport_id"));
  if (!id.success) return failState("Deporte no válido.");

  const name = getString(formData, "name");
  if (name.length < 2 || name.length > 60) return failState("El nombre debe tener entre 2 y 60 caracteres.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("sports")
    .update({ name, is_active: getBool(formData, "is_active") })
    .eq("id", id.data);
  if (error) return failState(dbErrorMessage(error, "No se pudo guardar el deporte."));

  refresh();
  return okState("Deporte guardado.");
}
