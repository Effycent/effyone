import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { NotificationList } from "@/components/notification-list";
import { Panel } from "@/components/ui/panel";
import { requireSuperAdmin } from "@/lib/auth/session";
import { markAllReadAction } from "@/lib/notifications/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Avisos" };

export default async function BackofficeNotificationsPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const [{ data: notifications }, { data: reads }, { data: unread }] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100),
    supabase.from("notification_reads").select("notification_id"),
    supabase.rpc("my_unread_notifications"),
  ]);
  const readIds = new Set((reads ?? []).map((r) => r.notification_id));

  return (
    <Panel
      title="Avisos"
      description="Solicitudes de cambio de plan y otras novedades de tus clientes."
      aside={
        (unread ?? 0) > 0 ? (
          <ActionForm action={markAllReadAction} submitLabel="Marcar todo como leído" variant="secondary" compact className="space-y-2">
            {null}
          </ActionForm>
        ) : null
      }
    >
      <NotificationList
        notifications={notifications ?? []}
        readIds={readIds}
        timezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        emptyText="No hay avisos por ahora. Cuando un cliente solicite un cambio de plan, aparecerá aquí."
      />
    </Panel>
  );
}
