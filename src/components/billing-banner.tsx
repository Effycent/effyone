import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { formatDateIn, formatDateTimeIn } from "@/lib/billing/labels";
import type { TenantOverview } from "@/types/database";

type Props = {
  overview: TenantOverview;
  timezone: string;
  /** Ruta de "Mi plan"; solo se muestra el enlace a quien puede gestionarlo. */
  planHref?: string;
};

/**
 * Aviso permanente sobre el estado de la suscripción. Se calcula desde el
 * acceso que entrega la base de datos (nunca lo decide la interfaz).
 * Cuando todo está al día no muestra nada.
 */
export function BillingBanner({ overview, timezone, planHref }: Props) {
  const state = overview.access_state;
  if (state === "full") return null;

  const link = planHref ? (
    <Link href={planHref} className="font-medium text-white underline decoration-brand underline-offset-4">
      Ver mi plan
    </Link>
  ) : null;

  if (state === "grace" && overview.grace_ends_at) {
    return (
      <Notice tone="warn" title="Tu pago está vencido">
        <p>
          Regulariza antes del <strong>{formatDateTimeIn(overview.grace_ends_at, timezone)}</strong>. Hasta
          entonces todo sigue funcionando; después tu cuenta pasará a solo lectura.
        </p>
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-xs uppercase tracking-widest text-asphalt-400">Tiempo restante</span>
          <Countdown endsAt={overview.grace_ends_at} serverNow={new Date().toISOString()} />
        </p>
        {link}
      </Notice>
    );
  }

  if (state === "read_only") {
    return (
      <Notice tone="danger" title="Tu cuenta está en solo lectura">
        <p>Puedes ver tus datos, pero no modificarlos, hasta que regularices tu pago. Tu vista pública sigue activa.</p>
        {link}
      </Notice>
    );
  }

  if (state === "suspended") {
    return (
      <Notice tone="danger" title="Tu cuenta está suspendida">
        <p>Puedes ver tus datos, pero no modificarlos, y tu vista pública está oculta. Contacta a EffyOne para reactivarla.</p>
        {link}
      </Notice>
    );
  }

  return (
    <Notice tone="danger" title="Tu suscripción fue cancelada">
      <p>
        {overview.purge_eligible_at
          ? `Conservamos tus datos hasta el ${formatDateIn(overview.purge_eligible_at, timezone)}. Puedes reactivarla antes de esa fecha.`
          : "Conservamos tus datos por un tiempo. Puedes reactivarla contactando a EffyOne."}
      </p>
      {link}
    </Notice>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "warn" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  const border = tone === "warn" ? "border-brand" : "border-danger";
  return (
    <div role="status" className={`border-l-4 ${border} space-y-2 bg-asphalt-900 px-4 py-3 text-sm text-asphalt-200`}>
      <p className="font-display text-xl font-bold uppercase tracking-wide text-white">{title}</p>
      {children}
    </div>
  );
}
