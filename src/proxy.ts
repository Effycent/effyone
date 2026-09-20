import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/session-refresh";

export async function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  matcher: [
    // Todo excepto archivos estáticos y optimización de imágenes.
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
