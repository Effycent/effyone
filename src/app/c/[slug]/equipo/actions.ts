"use server";

import { revalidatePath } from "next/cache";
import { getString } from "@/lib/actions/form";
import { failState, firstIssue, okState, type ActionState } from "@/lib/actions/state";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createUserAccount,
  findTenantMember,
  resetMemberPassword,
  setMemberActive,
} from "@/lib/team/accounts";
import { requireTenantAdminAction } from "@/lib/tenant/guard";
import { idSchema, newUserSchema } from "@/lib/validation/backoffice";

export async function addMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const parsed = newUserSchema.safeParse({
    full_name: getString(formData, "full_name"),
    email: getString(formData, "email"),
    role: getString(formData, "role"),
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));

  // Los límites del plan y los operadores los valida la base de datos; su mensaje llega tal cual.
  const account = await createUserAccount(createAdminClient(), {
    fullName: parsed.data.full_name,
    email: parsed.data.email,
    role: parsed.data.role,
    tenantId: guard.tenantId,
  });
  if (!account.ok) return failState(account.message);

  revalidatePath(`/c/${guard.slug}`, "layout");
  return okState("Usuario creado.", { credentials: account.credentials });
}

export async function resetMemberPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const userId = idSchema.safeParse(getString(formData, "user_id"));
  if (!userId.success) return failState("Datos no válidos.");
  if (userId.data === guard.userId) {
    return failState("No puedes restablecer tu propia contraseña aquí. Pídeselo a otro administrador.");
  }

  const admin = createAdminClient();
  const member = await findTenantMember(admin, guard.tenantId, userId.data);
  if (!member) return failState("Usuario no encontrado en tu equipo.");

  const result = await resetMemberPassword(admin, member);
  if (!result.ok) return failState(result.message);

  revalidatePath(`/c/${guard.slug}/equipo`);
  return okState("Contraseña restablecida.", { credentials: result.credentials });
}

export async function setMemberActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const userId = idSchema.safeParse(getString(formData, "user_id"));
  const active = getString(formData, "active") === "true";
  if (!userId.success) return failState("Datos no válidos.");
  if (userId.data === guard.userId) return failState("No puedes desactivar tu propia cuenta.");

  const admin = createAdminClient();
  const member = await findTenantMember(admin, guard.tenantId, userId.data);
  if (!member) return failState("Usuario no encontrado en tu equipo.");

  const result = await setMemberActive(admin, member.id, active);
  if (!result.ok) return failState(result.message);

  revalidatePath(`/c/${guard.slug}`, "layout");
  const label = active ? "activado" : "desactivado";
  return okState(
    result.banWarning
      ? `Usuario ${label}, pero no se pudo actualizar el bloqueo de inicio de sesión.`
      : `Usuario ${label}.`,
  );
}
