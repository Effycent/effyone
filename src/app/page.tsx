import { redirect } from "next/navigation";
import { homePathFor, requireContext } from "@/lib/auth/session";

/** Punto de entrada: envía a cada usuario a su panel según el rol. */
export default async function RootPage() {
  const ctx = await requireContext();
  redirect(homePathFor(ctx) ?? "/login?motivo=sin-acceso");
}
