type Props = {
  title: string;
  description?: string;
  /** Contenido alineado a la derecha del encabezado (botones, contadores). */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/** Bloque de información con encabezado, base de los paneles tipo "bento". */
export function Panel({ title, description, aside, className = "", children }: Props) {
  return (
    <section className={`border border-asphalt-700 bg-asphalt-850 ${className}`}>
      <header className="flex items-start justify-between gap-4 border-b border-asphalt-700 px-5 py-4">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">{title}</h2>
          {description ? <p className="mt-1 text-sm text-asphalt-400">{description}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
