// Utilidades compartidas por los scripts de desarrollo (Node, sin TypeScript).
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length > 0) {
    console.error(`Faltan variables en .env.local: ${missing.join(", ")}`);
    process.exit(1);
  }
  return Object.fromEntries(names.map((n) => [n, process.env[n]]));
}

/** Cliente con service_role: salta RLS. Solo para scripts locales del propietario. */
export function adminClient() {
  const env = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente con la clave pública: se comporta como un navegador. */
export function anonClient() {
  const env = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Contraseña temporal legible, ej. "Kf7m-Qz3p-Wa9x-Tb4n". */
export function generatePassword() {
  for (;;) {
    const groups = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""),
    );
    const password = groups.join("-");
    if (/\d/.test(password) && /[A-Za-z]/.test(password)) return password;
  }
}

/**
 * Crea el usuario en Auth y su perfil. Si el perfil falla, deshace el usuario
 * para no dejar cuentas sin rol.
 */
export async function createUserWithProfile(admin, { email, fullName, role, tenantId = null }) {
  const password = generatePassword();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear el usuario ${email}: ${error?.message ?? "sin detalle"}`);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    tenant_id: tenantId,
    role,
    full_name: fullName,
    must_change_password: true,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`No se pudo crear el perfil de ${email}: ${profileError.message}`);
  }

  return { id: data.user.id, email, password };
}
