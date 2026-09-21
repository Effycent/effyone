"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getString } from "@/lib/actions/form";
import {
  dbErrorMessage,
  failState,
  firstIssue,
  okState,
  type ActionState,
} from "@/lib/actions/state";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createUserAccount,
  findTenantMember,
  resetMemberPassword,
  setMemberActive,
} from "@/lib/team/accounts";
import { createClient } from "@/lib/supabase/server";
import {
  idSchema,
  newUserSchema,
  noteSchema,
  personSchema,
  subscriptionStatusSchema,
  tenantDataSchema,
} from "@/lib/validation/backoffice";

// Todas las acciones verifican primero que quien llama sea Super Admin
// (contra la base de datos, no contra el navegador).

function refresh(tenantId?: string) {
  revalidatePath("/backoffice", "layout");
  if (tenantId) revalidatePath(`/backoffice/clientes/${tenantId}`);
}

export async function createTenantAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const tenant = tenantDataSchema.safeParse({
    name: getString(formData, "name"),
    slug: getString(formData, "slug"),
    country: getString(formData, "country"),
    timezone: getString(formData, "timezone"),
  });
  if (!tenant.success) return failState(firstIssue(tenant.error));

  const person = personSchema.safeParse({
    full_name: getString(formData, "admin_name"),
    email: getString(formData, "admin_email"),
  });
  if (!person.success) return failState(firstIssue(person.error));

  const planId = idSchema.safeParse(getString(formData, "plan_id"));
  if (!planId.success) return failState("Elige un plan.");

  const admin = createAdminClient();

  const { data: plan } = await admin
    .from("plans")
    .select("id, is_active")
    .eq("id", planId.data)
    .maybeSingle();
  if (!plan || !plan.is_active) return failState("Ese plan no está disponible.");

  const { data: created, error } = await admin
    .from("tenants")
    .insert({ ...tenant.data, plan_id: plan.id })
    .select("id, slug")
    .single();
  if (error || !created) {
    return failState(dbErrorMessage(error ?? { message: "" }, "No se pudo crear el cliente."));
  }

  const account = await createUserAccount(admin, {
    fullName: person.data.full_name,
    email: person.data.email,
    role: "tenant_admin",
    tenantId: created.id,
  });
  if (!account.ok) {
    await admin.from("tenants").delete().eq("id", created.id);
    return failState(account.message);
  }

  refresh();
  return okState(`Cliente creado en /c/${created.slug}.`, {
    credentials: account.credentials,
    link: { href: `/backoffice/clientes/${created.id}`, label: "Abrir la ficha del cliente" },
  });
}

export async function updateTenantAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const id = idSchema.safeParse(getString(formData, "tenant_id"));
  if (!id.success) return failState("Cliente no válido.");

  const tenant = tenantDataSchema.safeParse({
    name: getString(formData, "name"),
    slug: getString(formData, "slug"),
    country: getString(formData, "country"),
    timezone: getString(formData, "timezone"),
  });
  if (!tenant.success) return failState(firstIssue(tenant.error));

  const admin = createAdminClient();
  const { error } = await admin.from("tenants").update(tenant.data).eq("id", id.data);
  if (error) return failState(dbErrorMessage(error, "No se pudieron guardar los cambios."));

  refresh(id.data);
  return okState("Datos del cliente guardados.");
}

export async function setTenantPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const tenantId = idSchema.safeParse(getString(formData, "tenant_id"));
  const planId = idSchema.safeParse(getString(formData, "plan_id"));
  const note = noteSchema.safeParse(getString(formData, "note"));
  if (!tenantId.success || !planId.success) return failState("Datos no válidos.");
  if (!note.success) return failState(firstIssue(note.error));

  // Con la sesión del Super Admin: la función SQL valida el rol y registra el evento.
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_tenant_plan", {
    p_tenant_id: tenantId.data,
    p_plan_id: planId.data,
    p_note: note.data || undefined,
  });
  if (error) return failState(dbErrorMessage(error, "No se pudo cambiar el plan."));

  refresh(tenantId.data);
  return okState("Plan actualizado. El cambio rige de inmediato.");
}

export async function setSubscriptionStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();

  const tenantId = idSchema.safeParse(getString(formData, "tenant_id"));
  const status = subscriptionStatusSchema.safeParse(getString(formData, "status"));
  const note = noteSchema.safeParse(getString(formData, "note"));
  if (!tenantId.success || !status.success) return failState("Datos no válidos.");
  if (!note.success) return failState(firstIssue(note.error));

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_subscription_status", {
    p_tenant_id: tenantId.data,
    p_status: status.data,
    p_note: note.data || undefined,
  });
  if (error) return failState(dbErrorMessage(error, "No se pudo cambiar el estado."));

  refresh(tenantId.data);
  return okState("Estado actualizado. El cambio rige de inmediato.");
}

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const tenantId = idSchema.safeParse(getString(formData, "tenant_id"));
  if (!tenantId.success) return failState("Cliente no válido.");

  const parsed = newUserSchema.safeParse({
    full_name: getString(formData, "full_name"),
    email: getString(formData, "email"),
    role: getString(formData, "role"),
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));

  const account = await createUserAccount(createAdminClient(), {
    fullName: parsed.data.full_name,
    email: parsed.data.email,
    role: parsed.data.role,
    tenantId: tenantId.data,
  });
  if (!account.ok) return failState(account.message);

  refresh(tenantId.data);
  return okState("Usuario creado.", { credentials: account.credentials });
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const tenantId = idSchema.safeParse(getString(formData, "tenant_id"));
  const userId = idSchema.safeParse(getString(formData, "user_id"));
  if (!tenantId.success || !userId.success) return failState("Datos no válidos.");

  const admin = createAdminClient();
  const member = await findTenantMember(admin, tenantId.data, userId.data);
  if (!member) return failState("Usuario no encontrado en este cliente.");

  const result = await resetMemberPassword(admin, member);
  if (!result.ok) return failState(result.message);

  refresh(tenantId.data);
  return okState("Contraseña restablecida.", { credentials: result.credentials });
}

export async function setUserActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const tenantId = idSchema.safeParse(getString(formData, "tenant_id"));
  const userId = idSchema.safeParse(getString(formData, "user_id"));
  const active = getString(formData, "active") === "true";
  if (!tenantId.success || !userId.success) return failState("Datos no válidos.");

  const admin = createAdminClient();
  const member = await findTenantMember(admin, tenantId.data, userId.data);
  if (!member) return failState("Usuario no encontrado en este cliente.");

  const result = await setMemberActive(admin, member.id, active);
  if (!result.ok) return failState(result.message);

  refresh(tenantId.data);
  const label = active ? "activado" : "desactivado";
  return okState(
    result.banWarning
      ? `Usuario ${label}, pero no se pudo actualizar el bloqueo de inicio de sesión.`
      : `Usuario ${label}.`,
  );
}

/** Elimina un cliente cancelado cuya retención ya venció. Irreversible. */
export async function purgeTenantAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const tenantId = idSchema.safeParse(getString(formData, "tenant_id"));
  if (!tenantId.success) return failState("Cliente no válido.");

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenant_overview")
    .select("id, slug, subscription_status, purge_eligible_at")
    .eq("id", tenantId.data)
    .maybeSingle();
  if (!tenant) return failState("Cliente no encontrado.");

  if (getString(formData, "confirm_slug") !== tenant.slug) {
    return failState("Escribe la dirección del cliente exactamente para confirmar.");
  }
  if (
    tenant.subscription_status !== "canceled" ||
    !tenant.purge_eligible_at ||
    new Date(tenant.purge_eligible_at) > new Date()
  ) {
    return failState("Este cliente todavía no es elegible para eliminarse.");
  }

  const { data: members } = await admin.from("profiles").select("id").eq("tenant_id", tenant.id);
  for (const member of members ?? []) {
    const { error } = await admin.auth.admin.deleteUser(member.id); // borra también el perfil
    if (error) return failState("No se pudo eliminar a todos los usuarios. Nada más se borró; intenta de nuevo.");
  }

  const { error } = await admin.from("tenants").delete().eq("id", tenant.id);
  if (error) return failState(dbErrorMessage(error, "No se pudo eliminar el cliente."));

  refresh();
  redirect("/backoffice");
}
