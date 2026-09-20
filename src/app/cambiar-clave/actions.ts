"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { homePathFor, requireContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(10, "Usa al menos 10 caracteres.")
      .max(72, "Usa como máximo 72 caracteres.")
      .regex(/[A-Za-z]/, "Incluye al menos una letra.")
      .regex(/\d/, "Incluye al menos un número."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Las contraseñas no coinciden.",
  });

export type ChangePasswordState = { error: string | null };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const ctx = await requireContext({ allowPasswordChange: true });

  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { error: "La nueva contraseña debe ser distinta de la temporal." };
    }
    if (error.code === "weak_password") {
      return { error: "Esa contraseña es demasiado débil. Prueba con otra." };
    }
    return { error: "No se pudo cambiar la contraseña. Intenta de nuevo." };
  }

  // Solo el servidor puede levantar la marca de "contraseña temporal".
  const admin = createAdminClient();
  const { error: flagError } = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", ctx.userId);
  if (flagError) {
    return { error: "La contraseña cambió, pero no se pudo actualizar tu perfil. Intenta de nuevo." };
  }

  redirect(homePathFor(ctx) ?? "/login?motivo=sin-acceso");
}
