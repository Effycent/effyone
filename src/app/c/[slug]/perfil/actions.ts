"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBool, getString } from "@/lib/actions/form";
import { dbErrorMessage, failState, firstIssue, okState, type ActionState } from "@/lib/actions/state";
import { createClient } from "@/lib/supabase/server";
import { requireTenantAdminAction } from "@/lib/tenant/guard";
import { LOGO_BUCKET, LOGO_MAX_BYTES, sniffImage } from "@/lib/tenant/logo";
import { tenantDataSchema } from "@/lib/validation/backoffice";

const profileSchema = tenantDataSchema.pick({ name: true, country: true, timezone: true });
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Elige un color válido.");

function refresh(slug: string) {
  revalidatePath(`/c/${slug}`, "layout");
}

const NOT_ALLOWED = "No se pudo guardar. Revisa que tu plan incluya esta función y que tu cuenta no esté en solo lectura.";

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const parsed = profileSchema.safeParse({
    name: getString(formData, "name"),
    country: getString(formData, "country"),
    timezone: getString(formData, "timezone"),
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));

  // Con la sesión del cliente: RLS y permisos de columna deciden (nunca el slug).
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .update(parsed.data)
    .eq("id", guard.tenantId)
    .select("id");
  if (error) return failState(dbErrorMessage(error, "No se pudieron guardar los datos."));
  if (!data?.length) return failState(NOT_ALLOWED);

  refresh(guard.slug);
  return okState("Datos guardados.");
}

export async function updateBrandColorsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  let colors: { brand_primary: string | null; brand_secondary: string | null };
  if (getBool(formData, "reset")) {
    colors = { brand_primary: null, brand_secondary: null };
  } else {
    const parsed = z
      .object({ brand_primary: hex, brand_secondary: hex })
      .safeParse({
        brand_primary: getString(formData, "brand_primary"),
        brand_secondary: getString(formData, "brand_secondary"),
      });
    if (!parsed.success) return failState(firstIssue(parsed.error));
    colors = {
      brand_primary: parsed.data.brand_primary.toLowerCase(),
      brand_secondary: parsed.data.brand_secondary.toLowerCase(),
    };
  }

  // La base de datos exige la función "tenant_branding" para poner colores.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .update(colors)
    .eq("id", guard.tenantId)
    .select("id");
  if (error) return failState(dbErrorMessage(error, "No se pudieron guardar los colores."));
  if (!data?.length) return failState(NOT_ALLOWED);

  refresh(guard.slug);
  return okState(colors.brand_primary ? "Colores guardados." : "Volviste a los colores de EffyOne.");
}

export async function uploadLogoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return failState("Elige una imagen para tu logo.");
  if (file.size > LOGO_MAX_BYTES) return failState("La imagen pesa más de 1 MB. Usa una más liviana.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniffImage(bytes);
  if (!format) return failState("Formato no válido. Usa una imagen PNG, JPG o WebP.");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("tenants")
    .select("logo_path")
    .eq("id", guard.tenantId)
    .single();

  // Nombre único por subida: el navegador nunca muestra un logo viejo en caché.
  const path = `${guard.tenantId}/logo-${Date.now()}.${format.ext}`;
  const { error: uploadError } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, bytes, { contentType: format.mime, cacheControl: "31536000" });
  if (uploadError) return failState(NOT_ALLOWED);

  const { data, error } = await supabase
    .from("tenants")
    .update({ logo_path: path })
    .eq("id", guard.tenantId)
    .select("id");
  if (error || !data?.length) {
    await supabase.storage.from(LOGO_BUCKET).remove([path]);
    return failState(error ? dbErrorMessage(error, NOT_ALLOWED) : NOT_ALLOWED);
  }

  if (current?.logo_path) await supabase.storage.from(LOGO_BUCKET).remove([current.logo_path]);

  refresh(guard.slug);
  return okState("Logo actualizado.");
}

export async function removeLogoAction(_prev: ActionState): Promise<ActionState> {
  const guard = await requireTenantAdminAction();
  if (!guard.ok) return failState(guard.message);

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("tenants")
    .select("logo_path")
    .eq("id", guard.tenantId)
    .single();
  if (!current?.logo_path) return okState("No hay logo para quitar.");

  const { data, error } = await supabase
    .from("tenants")
    .update({ logo_path: null })
    .eq("id", guard.tenantId)
    .select("id");
  if (error || !data?.length) return failState(error ? dbErrorMessage(error, NOT_ALLOWED) : NOT_ALLOWED);

  await supabase.storage.from(LOGO_BUCKET).remove([current.logo_path]);

  refresh(guard.slug);
  return okState("Logo eliminado.");
}
