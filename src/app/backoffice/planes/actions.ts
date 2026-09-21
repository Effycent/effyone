"use server";

import { revalidatePath } from "next/cache";
import { getBool, getString, parsePriceToCents } from "@/lib/actions/form";
import {
  dbErrorMessage,
  failState,
  firstIssue,
  okState,
  type ActionState,
} from "@/lib/actions/state";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { idSchema, newPlanSchema, planDataSchema } from "@/lib/validation/backoffice";

// Estas acciones escriben con la SESIÓN del Super Admin: las políticas RLS de
// plans, plan_features y addons son las que autorizan, no la clave de servidor.

function refresh() {
  revalidatePath("/backoffice", "layout");
}

const priceError = "El precio debe ser un monto en dólares, por ejemplo 37 o 37.50.";

export async function createPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const parsed = newPlanSchema.safeParse({
    code: getString(formData, "code"),
    name: getString(formData, "name"),
    description: getString(formData, "description"),
    sort_order: getString(formData, "sort_order") || "100",
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));

  const price = parsePriceToCents(getString(formData, "price"));
  if (price === null) return failState(priceError);

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("plans")
    .insert({
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description || null,
      sort_order: parsed.data.sort_order,
      price_cents: price,
      is_active: false, // nace inactivo: se activa cuando su matriz de funciones esté lista
    })
    .select("id")
    .single();
  if (error || !plan) return failState(dbErrorMessage(error ?? { message: "" }, "No se pudo crear el plan."));

  // Matriz completa desde el inicio: todo apagado y los límites en 0.
  const { data: catalog } = await supabase.from("feature_catalog").select("feature_key, kind");
  const rows = (catalog ?? []).map((f) => ({
    plan_id: plan.id,
    feature_key: f.feature_key,
    enabled: f.kind === "limit",
    limit_value: f.kind === "limit" ? 0 : null,
  }));
  const { error: featuresError } = await supabase.from("plan_features").insert(rows);
  if (featuresError) {
    await supabase.from("plans").delete().eq("id", plan.id);
    return failState(dbErrorMessage(featuresError, "No se pudo preparar el plan."));
  }

  refresh();
  return okState("Plan creado (inactivo). Configura sus funciones y actívalo.", {
    link: { href: `/backoffice/planes/${plan.id}`, label: "Configurar el plan" },
  });
}

export async function updatePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const planId = idSchema.safeParse(getString(formData, "plan_id"));
  if (!planId.success) return failState("Plan no válido.");

  const parsed = planDataSchema.safeParse({
    name: getString(formData, "name"),
    description: getString(formData, "description"),
    sort_order: getString(formData, "sort_order") || "0",
  });
  if (!parsed.success) return failState(firstIssue(parsed.error));

  const price = parsePriceToCents(getString(formData, "price"));
  if (price === null) return failState(priceError);

  const supabase = await createClient();
  const { data: catalog, error: catalogError } = await supabase
    .from("feature_catalog")
    .select("feature_key, kind, name");
  if (catalogError || !catalog) return failState("No se pudo leer el catálogo de funciones.");

  const rows = [];
  for (const feature of catalog) {
    if (feature.kind === "boolean") {
      rows.push({
        plan_id: planId.data,
        feature_key: feature.feature_key,
        enabled: getBool(formData, `f_${feature.feature_key}`),
        limit_value: null,
      });
      continue;
    }
    const unlimited = getBool(formData, `u_${feature.feature_key}`);
    const raw = getString(formData, `l_${feature.feature_key}`);
    if (!unlimited && !/^\d{1,6}$/.test(raw)) {
      return failState(`"${feature.name}": escribe un número entero (0 o más) o marca "Ilimitado".`);
    }
    rows.push({
      plan_id: planId.data,
      feature_key: feature.feature_key,
      enabled: true,
      limit_value: unlimited ? null : Number.parseInt(raw, 10),
    });
  }

  const { error: featuresError } = await supabase
    .from("plan_features")
    .upsert(rows, { onConflict: "plan_id,feature_key" });
  if (featuresError) return failState(dbErrorMessage(featuresError, "No se pudieron guardar las funciones."));

  const { error } = await supabase
    .from("plans")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      sort_order: parsed.data.sort_order,
      price_cents: price,
      is_active: getBool(formData, "is_active"),
    })
    .eq("id", planId.data);
  if (error) return failState(dbErrorMessage(error, "No se pudo guardar el plan."));

  refresh();
  return okState("Plan guardado. Los cambios ya rigen para todos los clientes con este plan.");
}

export async function updateAddonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();

  const addonId = idSchema.safeParse(getString(formData, "addon_id"));
  if (!addonId.success) return failState("Add-on no válido.");

  const name = getString(formData, "name");
  if (name.length < 2 || name.length > 80) return failState("El nombre debe tener entre 2 y 80 caracteres.");

  const price = parsePriceToCents(getString(formData, "price"));
  if (price === null) return failState(priceError);

  const supabase = await createClient();
  const { error } = await supabase
    .from("addons")
    .update({ name, price_cents: price, is_active: getBool(formData, "is_active") })
    .eq("id", addonId.data);
  if (error) return failState(dbErrorMessage(error, "No se pudo guardar el add-on."));

  refresh();
  return okState("Add-on guardado.");
}
