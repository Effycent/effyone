import "server-only";
import { dbErrorMessage, type Credentials } from "@/lib/actions/state";
import { generateTempPassword } from "@/lib/auth/passwords";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/types/database";

// Lógica de cuentas de usuario compartida por el Backoffice (Super Admin) y el
// panel del cliente (Administrador). Usan la clave de servidor: quien las llame
// debe haber verificado ANTES el rol y el cliente al que pertenece el usuario.

type AdminClient = ReturnType<typeof createAdminClient>;

type Failure = { ok: false; message: string };

export async function createUserAccount(
  admin: AdminClient,
  input: { fullName: string; email: string; role: Exclude<AppRole, "super_admin">; tenantId: string },
): Promise<{ ok: true; userId: string; credentials: Credentials } | Failure> {
  const password = generateTempPassword();

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    if (error?.code === "email_exists") {
      return { ok: false, message: "Ese correo ya tiene una cuenta en EffyOne." };
    }
    return { ok: false, message: "No se pudo crear la cuenta. Intenta de nuevo." };
  }

  // Los límites del plan (administradores, operadores) los valida la base de datos.
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    tenant_id: input.tenantId,
    role: input.role,
    full_name: input.fullName,
    must_change_password: true,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, message: dbErrorMessage(profileError, "No se pudo crear el perfil del usuario.") };
  }

  return {
    ok: true,
    userId: data.user.id,
    credentials: { name: input.fullName, email: input.email, password },
  };
}

/** Perfil de un usuario SOLO si pertenece a ese cliente y no es Super Admin. */
export async function findTenantMember(admin: AdminClient, tenantId: string, userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, role, tenant_id, is_active")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .neq("role", "super_admin")
    .maybeSingle();
  return data;
}

export async function resetMemberPassword(
  admin: AdminClient,
  member: { id: string; full_name: string },
): Promise<{ ok: true; credentials: Credentials } | Failure> {
  const { data: authUser } = await admin.auth.admin.getUserById(member.id);
  const email = authUser.user?.email;
  if (!email) return { ok: false, message: "No se encontró la cuenta del usuario." };

  const password = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(member.id, { password });
  if (error) return { ok: false, message: "No se pudo restablecer la contraseña." };

  const { error: flagError } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", member.id);
  if (flagError) {
    return { ok: false, message: "La contraseña cambió, pero no se pudo marcar como temporal. Repite la acción." };
  }

  return { ok: true, credentials: { name: member.full_name, email, password } };
}

export async function setMemberActive(
  admin: AdminClient,
  memberId: string,
  active: boolean,
): Promise<{ ok: true; banWarning: boolean } | Failure> {
  // 1) El perfil manda: inactivo = sin acceso a datos al instante (y valida límites al reactivar).
  const { error } = await admin.from("profiles").update({ is_active: active }).eq("id", memberId);
  if (error) return { ok: false, message: dbErrorMessage(error, "No se pudo cambiar el estado del usuario.") };

  // 2) Además se bloquea/desbloquea el inicio de sesión en Auth.
  const { error: banError } = await admin.auth.admin.updateUserById(memberId, {
    ban_duration: active ? "none" : "876000h",
  });
  return { ok: true, banWarning: !!banError };
}
