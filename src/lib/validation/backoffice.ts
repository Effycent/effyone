import { z } from "zod";
import { isKnownCountry, isKnownTimezone } from "@/lib/geo";

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "La dirección necesita al menos 3 caracteres.")
  .max(40, "La dirección admite hasta 40 caracteres.")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "La dirección solo admite minúsculas, números y guiones (sin espacios ni guiones al inicio o final).",
  );

export const tenantDataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre necesita al menos 2 caracteres.")
    .max(120, "El nombre admite hasta 120 caracteres."),
  slug: slugSchema,
  country: z.string().refine(isKnownCountry, "Elige un país de la lista."),
  timezone: z.string().refine(isKnownTimezone, "Elige una zona horaria de la lista."),
});

export const personSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "El nombre necesita al menos 2 caracteres.")
    .max(120, "El nombre admite hasta 120 caracteres."),
  email: z.string().trim().toLowerCase().pipe(z.email("Escribe un correo válido.")),
});

export const newUserSchema = personSchema.extend({
  role: z.enum(["tenant_admin", "operator"], "Elige un rol."),
});

export const idSchema = z.uuid("Identificador no válido.");

export const noteSchema = z.string().trim().max(300, "La nota admite hasta 300 caracteres.");

export const subscriptionStatusSchema = z.enum(["active", "past_due", "suspended", "canceled"]);

export const planDataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre necesita al menos 2 caracteres.")
    .max(60, "El nombre admite hasta 60 caracteres."),
  description: z.string().trim().max(300, "La descripción admite hasta 300 caracteres."),
  sort_order: z.coerce.number().int("El orden debe ser un número entero.").min(0).max(1000),
});

export const newPlanSchema = planDataSchema.extend({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,29}$/, "El código usa minúsculas, números y guion bajo (2 a 30 caracteres)."),
});

export const settingsSchema = z.object({
  grace_days: z.coerce
    .number("Escribe un número.")
    .int("Los días deben ser un número entero.")
    .min(0, "Mínimo 0 días.")
    .max(30, "Máximo 30 días."),
  canceled_retention_days: z.coerce
    .number("Escribe un número.")
    .int("Los días deben ser un número entero.")
    .min(1, "Mínimo 1 día.")
    .max(3650, "Máximo 3650 días."),
});
