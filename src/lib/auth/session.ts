import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Tenant } from "@/types/database";

export type SessionContext = {
  userId: string;
  email: string | null;
  profile: Profile;
  tenant: Tenant | null;
};

/**
 * Identidad verificada del usuario actual (JWT validado) + su perfil y tenant.
 * Las lecturas pasan por RLS. Devuelve null si no hay sesión o no hay perfil.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  let tenant: Tenant | null = null;
  if (profile.tenant_id) {
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    tenant = tenantRow;
  }

  const email = typeof data.claims.email === "string" ? data.claims.email : null;
  return { userId, email, profile, tenant };
});

/** Ruta de inicio según el rol. null = el usuario no tiene un destino válido. */
export function homePathFor(ctx: SessionContext): string | null {
  if (ctx.profile.role === "super_admin") return "/backoffice";
  return ctx.tenant ? `/c/${ctx.tenant.slug}` : null;
}

/** Exige sesión activa. Redirige al login o al cambio obligatorio de contraseña. */
export async function requireContext(options?: {
  allowPasswordChange?: boolean;
}): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.profile.is_active) redirect("/login?motivo=desactivada");
  if (ctx.profile.must_change_password && !options?.allowPasswordChange) {
    redirect("/cambiar-clave");
  }
  return ctx;
}

/** Exige rol Super Admin (verificado contra la base de datos, no contra el token). */
export async function requireSuperAdmin(): Promise<SessionContext> {
  const ctx = await requireContext();
  if (ctx.profile.role !== "super_admin") {
    redirect(homePathFor(ctx) ?? "/login?motivo=sin-acceso");
  }
  return ctx;
}

/**
 * Exige acceso al tenant de la URL. RLS decide qué tenants existen para el
 * usuario: uno ajeno devuelve 404 igual que uno inexistente.
 */
export async function requireTenantAccess(slug: string) {
  const ctx = await requireContext();
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  return { ctx, tenant, isSupportView: ctx.profile.role === "super_admin" };
}
