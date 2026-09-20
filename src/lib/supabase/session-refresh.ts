import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Renueva la sesión de Supabase en cada petición y propaga las cookies
 * actualizadas. No decide accesos: eso lo hacen los guards de servidor
 * (src/lib/auth/session.ts), porque las rutas públicas de fans compartirán
 * prefijo con las privadas.
 */
export async function refreshSession(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Valida el JWT y, si expiró, lo renueva con el refresh token.
  await supabase.auth.getClaims();

  return response;
}
