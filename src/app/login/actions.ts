"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

export type LoginState = { error: string | null; email: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const rawEmail = formData.get("email");
  // Se devuelve el correo para que el formulario no lo borre tras un error.
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";

  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Escribe un correo y una contraseña válidos.", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    // Mensaje único: no revela si el correo existe.
    return { error: "Correo o contraseña incorrectos.", email };
  }

  // Un perfil ausente o desactivado no debe entrar aunque la contraseña sea válida.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      error: "Tu cuenta no tiene acceso. Contacta al administrador de tu complejo.",
      email,
    };
  }

  redirect("/");
}
