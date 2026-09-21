import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { NotificationList } from "@/components/notification-list";
import { Panel } from "@/components/ui/panel";
import { markAllReadAction } from "@/lib/notifications/actions";
import { createClient } from "@/lib/supabase/server";
import { requireTenantManagerPage } from "@/lib/tenant/panel";

export const metadata: Metadata = { title: "Avisos" };

export default async function TenantNotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const panel = await requireTenantManagerPage(slug);

  const supabase = await createClient();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  const { data: reads } = await supabase.from("notification_reads").select("notification_id");
  const readIds = new Set((reads ?? []).map((r) => r.notification_id));

  return (
    <Panel
      title="Avisos"
      description="Novedades sobre tu suscripción y tu cuenta."
      aside={
        panel.unread > 0 ? (
          <ActionForm action={markAllReadAction} submitLabel="Marcar todo como leído" variant="secondary" compact className="space-y-2" >
            {null}
          </ActionForm>
        ) : null
      }
    >
      <NotificationList
        notifications={notifications ?? []}
        readIds={readIds}
        timezone={panel.tenant.timezone}
        emptyText={
          panel.isSupportView
            ? "Los avisos del cliente son solo para sus administradores."
            : "No tienes avisos por ahora."
        }
      />
    </Panel>
  );
}
