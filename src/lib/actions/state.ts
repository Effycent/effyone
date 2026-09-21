import type { ZodError } from "zod";

export type Credentials = {
  name: string;
  email: string;
  password: string;
};

/** Resultado común de las Server Actions que usan formularios. */
export type ActionState = {
  status: "idle" | "ok" | "error";
  message: string | null;
  /** Contraseña temporal: se muestra una sola vez y no se guarda en ningún lado. */
  credentials?: Credentials;
  /** Enlace de continuación tras una acción exitosa (ej. ir al cliente creado). */
  link?: { href: string; label: string };
};

export const idleState: ActionState = { status: "idle", message: null };

export const okState = (
  message: string,
  extra?: { credentials?: Credentials; link?: ActionState["link"] },
): ActionState => ({
  status: "ok",
  message,
  ...extra,
});

export const failState = (message: string): ActionState => ({ status: "error", message });

export function firstIssue(error: ZodError): string {
  return error.issues[0]?.message ?? "Revisa los datos ingresados.";
}

type DbError = { code?: string; message: string };

const CONSTRAINT_MESSAGES: Record<string, string> = {
  tenants_slug_key: "Esa dirección ya está en uso. Elige otra.",
  tenants_slug_format: "La dirección solo admite minúsculas, números y guiones (3 a 40 caracteres).",
  tenants_slug_reserved: "Esa dirección está reservada. Elige otra.",
  plans_code_key: "Ya existe un plan con ese código.",
  plans_code_format: "El código del plan solo admite minúsculas, números y guion bajo.",
  plans_default_is_active: "El plan por defecto no se puede desactivar.",
  plans_price_nonnegative: "El precio no puede ser negativo.",
};

/** Traduce errores de PostgreSQL a mensajes claros para el usuario. */
export function dbErrorMessage(error: DbError, fallback: string): string {
  for (const [constraint, message] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (error.message.includes(constraint)) return message;
  }
  if (error.code === "42501") return "No tienes permiso para esta acción.";
  // Mensajes propios de las reglas de EffyOne (ya vienen en español).
  if (
    (error.code === "check_violation" || error.code === "23514" || error.code === "22023") &&
    !error.message.includes("violates check constraint")
  ) {
    return error.message;
  }
  if (error.code === "23505") return "Ya existe un registro con esos datos.";
  return fallback;
}
