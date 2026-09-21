"use server";

import { revalidatePath } from "next/cache";
import { getString } from "@/lib/actions/form";
import { dbErrorMessage, failState, firstIssue, okState, type ActionState } from "@/lib/actions/state";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { settingsSchema } from "@/lib/validation/backoffice";

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const parsed = settingsSchema.safeParse({
    grace_days: getString(formData, "grace_days"),
    canceled_retention_days: getString(formData, "canceled_retention_days"),
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));

  // Con la sesión del Super Admin: la política RLS de platform_settings autoriza.
  const supabase = await createClient();
  const { error } = await supabase.from("platform_settings").update(parsed.data).eq("id", true);
  if (error) return failState(dbErrorMessage(error, "No se pudieron guardar los ajustes."));

  revalidatePath("/backoffice", "layout");
  return okState("Ajustes guardados. Rigen de inmediato para todos los clientes.");
}
