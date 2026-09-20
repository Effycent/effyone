import { BrandLogo } from "@/components/brand-logo";

const HIGHLIGHTS = [
  { n: "01", text: "Calendarios y llaves generados automáticamente" },
  { n: "02", text: "Vocalías y resultados en tiempo real" },
  { n: "03", text: "Cada complejo con sus datos, aislados del resto" },
];

/** Marco de las pantallas de acceso: panel de marca + formulario. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-asphalt-700 bg-asphalt-900 lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 top-0 h-full w-40 -skew-x-[18deg] bg-asphalt-850" />
          <div className="absolute -right-2 top-0 h-full w-3 -skew-x-[18deg] bg-asphalt-800" />
          <div className="absolute right-24 top-0 h-full w-1 -skew-x-[18deg] bg-asphalt-700" />
        </div>

        <BrandLogo className="relative w-56" />

        <div className="relative max-w-md space-y-8">
          <h2 className="font-display text-6xl font-extrabold uppercase leading-[0.95] tracking-tight">
            Tu torneo,
            <br />
            sin hojas de cálculo
          </h2>
          <ul className="space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.n} className="flex items-baseline gap-4 border-t border-asphalt-700 pt-4">
                <span className="font-display text-2xl font-bold text-asphalt-400">{item.n}</span>
                <span className="text-sm text-asphalt-200">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-asphalt-400">© EffyOne</p>
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm space-y-8">
          <BrandLogo className="w-40 lg:hidden" />
          <header className="space-y-2">
            <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight">
              {title}
            </h1>
            {subtitle ? <p className="text-sm text-asphalt-200">{subtitle}</p> : null}
          </header>
          {children}
        </div>
      </section>
    </main>
  );
}
