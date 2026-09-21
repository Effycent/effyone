"use server";

import { revalidatePath } from "next/cache";
import { failState, okState, type ActionState } from "@/lib/actions/state";
import { requireContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Marca como leídos todos los avisos que el usuario puede ver (RLS decide cuáles). */
export async function markAllReadAction(_prev: ActionState): Promise<ActionState> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const { data: visible } = await supabase
    .from("notifications")
    .select("id")
    .order("id", { ascending: false })
    .limit(200);
  const ids = (visible ?? []).map((n) => n.id);
  if (ids.length === 0) return okState("No hay avisos por marcar.");

  const { error } = await supabase.from("notification_reads").upsert(
    ids.map((id) => ({ notification_id: id, user_id: ctx.userId })),
    { onConflict: "notification_id,user_id", ignoreDuplicates: true },
  );
  if (error) return failState("No se pudieron marcar los avisos. Intenta de nuevo.");

  revalidatePath("/", "layout");
  return okState("Todos los avisos quedaron como leídos.");
}
