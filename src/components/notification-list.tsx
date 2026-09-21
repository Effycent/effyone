import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeIn } from "@/lib/billing/labels";
import type { AppNotification, NotificationSeverity } from "@/types/database";

const BAR: Record<NotificationSeverity, string> = {
  info: "border-asphalt-600",
  warning: "border-brand",
  critical: "border-danger",
};

type Props = {
  notifications: AppNotification[];
  readIds: Set<number>;
  /** Zona horaria para mostrar las fechas (la del cliente; en el Backoffice, la local). */
  timezone: string;
  emptyText: string;
};

/** Lista de avisos: los nuevos resaltados, con enlace a donde se resuelven. */
export function NotificationList({ notifications, readIds, timezone, emptyText }: Props) {
  if (notifications.length === 0) {
    return <p className="text-sm text-asphalt-200">{emptyText}</p>;
  }

  return (
    <ul className="space-y-3">
      {notifications.map((n) => {
        const unread = !readIds.has(n.id);
        return (
          <li
            key={n.id}
            className={`space-y-1.5 border-l-4 px-4 py-3 ${BAR[n.severity]} ${unread ? "bg-asphalt-800" : "bg-asphalt-900"}`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="font-display text-xl font-bold uppercase tracking-wide">{n.title}</p>
              {unread ? <Badge tone="warn">Nuevo</Badge> : null}
              <span className="ml-auto text-xs text-asphalt-400">{formatDateTimeIn(n.created_at, timezone)}</span>
            </div>
            {n.body ? <p className="whitespace-pre-line text-sm text-asphalt-200">{n.body}</p> : null}
            {n.link ? (
              <Link href={n.link} className="inline-block text-sm font-medium underline decoration-brand underline-offset-4">
                Ver detalle
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
