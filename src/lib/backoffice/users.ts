import "server-only";
import { generateTempPassword } from "@/lib/auth/passwords";
import { dbErrorMessage, type Credentials } from "@/lib/actions/state";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;

type Result =
  | { ok: true; userId: string; credentials: Credentials }
  | { ok: false; message: string };

/**
 * Crea la cuenta en Auth (con contraseña temporal) y su perfil. Si el perfil
 * falla —por ejemplo, por el límite de administradores del plan— deshace la
 * cuenta para no dejar usuarios sin rol.
 */
export async function createUserAccount(
  admin: AdminClient,
  input: { fullName: string; email: string; role: Exclude<AppRole, "super_admin">; tenantId: string },
): Promise<Result> {
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
