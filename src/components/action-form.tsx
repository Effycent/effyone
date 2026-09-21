"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";
import { CredentialsCard } from "@/components/credentials-card";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { idleState, type ActionState } from "@/lib/actions/state";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  children: ReactNode;
  /** Vacía el formulario cuando la acción sale bien (útil en formularios de alta). */
  resetOnSuccess?: boolean;
  /** Pide confirmación al navegador antes de enviar (acciones delicadas). */
  confirmMessage?: string;
  variant?: "primary" | "secondary" | "danger";
  /** Botón más pequeño, para acciones dentro de listas. */
  compact?: boolean;
  className?: string;
};

/**
 * Formulario para Server Actions con mensaje de resultado.
 * A diferencia del envío nativo de React 19, NO borra lo escrito cuando hay un
 * error: así se puede corregir sin volver a teclear todo.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Guardando…",
  children,
  resetOnSuccess = false,
  confirmMessage,
  variant = "primary",
  compact = false,
  className = "space-y-4",
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(action, idleState);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.status === "ok" && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className} noValidate>
      {children}
      {state.credentials ? <CredentialsCard credentials={state.credentials} /> : null}
      {state.message ? (
        <FormMessage tone={state.status === "error" ? "error" : "info"}>{state.message}</FormMessage>
      ) : null}
      {state.link ? (
        <Link
          href={state.link.href}
          className="block w-fit text-sm font-medium text-white underline decoration-brand underline-offset-4"
        >
          {state.link.label}
        </Link>
      ) : null}
      <Button
        type="submit"
        variant={variant}
        pending={pending}
        className={compact ? "h-9 px-3 text-sm" : "h-11 text-base"}
      >
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
