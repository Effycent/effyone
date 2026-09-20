import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import { homePathFor, requireContext } from "@/lib/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Crea tu contraseña" };

export default async function ChangePasswordPage() {
  const ctx = await requireContext({ allowPasswordChange: true });
  if (!ctx.profile.must_change_password) {
    redirect(homePathFor(ctx) ?? "/login?motivo=sin-acceso");
  }

  return (
    <AuthShell
      title="Crea tu contraseña"
      subtitle="Entraste con una contraseña temporal. Elige una propia para continuar."
    >
      <ChangePasswordForm />
      <form action={signOutAction}>
        <Button type="submit" variant="secondary" className="w-full">
          Salir
        </Button>
      </form>
    </AuthShell>
  );
}
