import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Cliente con la clave service_role: SALTA RLS.
 * Úsalo únicamente en el servidor, DESPUÉS de verificar que quien llama tiene
 * permiso (por ejemplo requireSuperAdmin()). Nunca lo importes desde un
 * componente de cliente.
 */
export function createAdminClient() {
  const publicEnv = getPublicEnv();
  const serverEnv = getServerEnv();

  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
