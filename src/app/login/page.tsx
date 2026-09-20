import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { FormMessage } from "@/components/ui/form-message";
import { getSessionContext, homePathFor } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar" };

const REASONS: Record<string, string> = {
  desactivada: "Tu cuenta fue desactivada. Contacta al administrador de tu complejo.",
  "sin-acceso": "Tu usuario no tiene un panel asignado. Contacta a soporte.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;

  // Si ya hay una sesión válida, no mostrar el formulario.
  const ctx = await getSessionContext();
  if (ctx?.profile.is_active) {
    if (ctx.profile.must_change_password) redirect("/cambiar-clave");
    const home = homePathFor(ctx);
    if (home) redirect(home);
  }

  const reason = motivo ? REASONS[motivo] : undefined;

  return (
    <AuthShell title="Ingresar" subtitle="Accede al panel de tu complejo o al backoffice.">
      {reason ? <FormMessage tone="info">{reason}</FormMessage> : null}
      <LoginForm />
    </AuthShell>
  );
}
