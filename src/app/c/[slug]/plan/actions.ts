"use server";

import { getString } from "@/lib/actions/form";
import { dbErrorMessage, failState, firstIssue, okState, type ActionState } from "@/lib/actions/state";
import { createClient } from "@/lib/supabase/server";
import { requireTenantAdminAction } from "@/lib/tenant/guard";
import { idSchema, noteSchema } from "@/lib/validation/backoffice";

/** El cliente pide un cambio de plan; EffyOne lo recibe como aviso en el Backoffice. */
export async function requestUpgradeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Se puede pedir un cambio aunque la cuenta esté en solo lectura.
  const guard = await requireTenantAdminAction({ needsWrite: false });
  if (!guard.ok) return failState(guard.message);

  const planId = idSchema.safeParse(getString(formData, "plan_id"));
  if (!planId.success) return failState("Plan no válido.");
  const message = noteSchema.safeParse(getString(formData, "message"));
  if (!message.success) return failState(firstIssue(message.error));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_plan_upgrade", {
    p_plan_id: planId.data,
    p_message: message.data || undefined,
  });
  if (error) return failState(dbErrorMessage(error, "No se pudo enviar la solicitud."));

  return okState(
    data
      ? "Solicitud enviada. El equipo de EffyOne la recibió y te contactará para coordinar el cambio."
      : "Ya enviaste esta solicitud hoy. El equipo de EffyOne te contactará pronto.",
  );
}
