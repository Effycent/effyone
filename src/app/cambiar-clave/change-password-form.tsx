"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { TextField } from "@/components/ui/text-field";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = { error: null };

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <TextField
        label="Nueva contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 10 caracteres, con letras y números."
        required
        autoFocus
      />
      <TextField
        label="Repite la contraseña"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
      />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Button type="submit" pending={pending} className="w-full">
        {pending ? "Guardando…" : "Guardar y continuar"}
      </Button>
    </form>
  );
}
