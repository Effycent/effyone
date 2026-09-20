import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.url(),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => i.path.join(".")).join(", ");
}

let publicCache: z.infer<typeof publicSchema> | undefined;

/** Variables públicas (visibles en el navegador). Se validan al primer uso. */
export function getPublicEnv() {
  if (!publicCache) {
    // Next solo inyecta NEXT_PUBLIC_* si se leen de forma literal.
    const parsed = publicSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    });
    if (!parsed.success) {
      throw new Error(
        `Faltan o son inválidas variables de entorno públicas: ${formatIssues(parsed.error)}. Revisa .env.local`,
      );
    }
    publicCache = parsed.data;
  }
  return publicCache;
}

/** Variables secretas. Solo se pueden usar en código de servidor. */
export function getServerEnv() {
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      `Faltan o son inválidas variables de entorno de servidor: ${formatIssues(parsed.error)}. Revisa .env.local`,
    );
  }
  return parsed.data;
}
