import "server-only";
import { requireContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type Guard =
  | { ok: true; tenantId: string; slug: string; userId: string }
  | { ok: false; message: string };

/**
 * Guarda de las acciones de un cliente. Verifica, contra la base de datos:
 *   1. que quien llama sea Administrador de SU propio cliente, y
 *   2. (si se pide) que el acceso permita escribir (no esté en solo lectura).
 * El cliente afectado sale SIEMPRE de la sesión, nunca de datos del formulario.
 */
export async function requireTenantAdminAction(options?: { needsWrite?: boolean }): Promise<Guard> {
  const ctx = await requireContext();
  if (ctx.profile.role !== "tenant_admin" || !ctx.tenant) {
    return { ok: false, message: "Solo un administrador del cliente puede hacer esto." };
  }

  if (options?.needsWrite !== false) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tenant_overview")
      .select("access_state")
      .eq("id", ctx.tenant.id)
      .single();
    if (data?.access_state !== "full" && data?.access_state !== "grace") {
      return {
        ok: false,
        message: "Tu cuenta está en solo lectura. Regulariza tu pago para volver a hacer cambios.",
      };
    }
  }

  return { ok: true, tenantId: ctx.tenant.id, slug: ctx.tenant.slug, userId: ctx.userId };
}
