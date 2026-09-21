import Link from "next/link";
import { LockIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";

type Props = {
  name: string;
  /** Beneficio en una línea, en lenguaje simple. */
  benefit: string;
  /** Plan más económico que la incluye. */
  requiredPlanName?: string;
  /** Incluida en el plan pero en pausa por mora. */
  paused?: boolean;
  comingSoon?: boolean;
  /** Si no se pasa (operadores, soporte), no se muestra el botón. */
  upgradeHref?: string;
  /** "primary" para un bloqueo aislado; "quiet" dentro de cuadrículas. */
  emphasis?: "primary" | "quiet";
};

/** Tarjeta de una función que el plan actual no incluye: se ve, con candado. */
export function LockedFeature({
  name,
  benefit,
  requiredPlanName,
  paused = false,
  comingSoon = false,
  upgradeHref,
  emphasis = "primary",
}: Props) {
  const buttonStyle =
    emphasis === "primary"
      ? "bg-brand text-black hover:bg-brand-strong"
      : "border border-asphalt-600 text-white hover:border-asphalt-400 hover:bg-asphalt-800";

  return (
    <div className="flex h-full flex-col gap-3 border border-dashed border-asphalt-600 bg-asphalt-900 p-4">
      <div className="flex items-start gap-3">
        <LockIcon className="mt-0.5 shrink-0 text-asphalt-400" />
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-display text-xl font-bold uppercase tracking-wide">
            {name}
            {comingSoon ? <Badge>Próximamente</Badge> : null}
            {paused ? <Badge tone="danger">En pausa por mora</Badge> : null}
          </p>
          <p className="text-sm text-asphalt-200">{benefit}</p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        {paused ? (
          <p className="text-xs text-asphalt-400">Regulariza tu pago para reactivarla.</p>
        ) : requiredPlanName ? (
          <p className="text-xs uppercase tracking-widest text-asphalt-400">
            Incluida desde {requiredPlanName}
          </p>
        ) : null}
        {upgradeHref ? (
          <Link
            href={upgradeHref}
            className={`inline-flex h-10 items-center px-4 font-display text-base font-bold uppercase tracking-wide ${buttonStyle}`}
          >
            {paused ? "Ver mi plan" : "Mejorar plan"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
