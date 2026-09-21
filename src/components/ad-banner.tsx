import Link from "next/link";

type Props = {
  /** Plan más económico que quita la publicidad (sale de la configuración, no del código). */
  planName?: string;
  /** Ruta de "Mi plan"; solo se muestra el botón a quien puede gestionarlo. */
  planHref?: string;
};

/**
 * Publicidad propia de EffyOne para el plan Bronce (no hay anunciantes de
 * terceros). Se muestra solo cuando el plan NO incluye la función "ad_free".
 */
export function AdBanner({ planName, planHref }: Props) {
  return (
    <aside
      aria-label="Publicidad de EffyOne"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 border border-asphalt-700 bg-asphalt-850 px-4 py-3"
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-asphalt-400">
        Publicidad
      </span>
      <p className="min-w-0 flex-1 text-sm text-asphalt-200">
        <strong className="font-display text-lg font-bold uppercase tracking-wide text-white">
          {planName ? `Pásate a ${planName}` : "Mejora tu plan"}
        </strong>{" "}
        y quita la publicidad. Descubre todo lo que incluyen los planes de pago.
      </p>
      {planHref ? (
        <Link
          href={planHref}
          className="inline-flex h-10 items-center border border-asphalt-600 px-4 font-display text-base font-bold uppercase tracking-wide hover:border-asphalt-400 hover:bg-asphalt-800"
        >
          Ver planes
        </Link>
      ) : null}
    </aside>
  );
}
