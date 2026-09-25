type Props = {
  /** Cantidad actual. */
  value: number;
  /** Límite del plan. null = ilimitado. */
  limit: number | null;
  /** Texto completo tras el número cuando NO es ilimitado, ej. "de 5 equipos permitidos en tu plan". */
  label: string;
  /** Texto tras el número cuando SÍ es ilimitado, ej. "equipos (sin límite en tu plan)". */
  unlimitedLabel: string;
};

/** Número grande + barra de progreso para mostrar el uso de un límite del plan. */
export function UsageMeter({ value, limit, label, unlimitedLabel }: Props) {
  const unlimited = limit === null;
  const atLimit = !unlimited && value >= limit;

  return (
    <div className="space-y-3">
      <p className="flex items-baseline gap-3">
        <span className="font-display text-5xl font-extrabold tabular-nums">{value}</span>
        <span className="text-asphalt-400">{unlimited ? unlimitedLabel : label}</span>
      </p>
      {unlimited ? null : (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(value, limit)}
          className="h-2 w-full bg-asphalt-700"
        >
          <div
            className={`h-full ${atLimit ? "bg-danger" : "bg-brand"}`}
            style={{ width: `${limit === 0 ? 100 : Math.min(100, (value / limit) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
