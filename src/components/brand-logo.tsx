import Image from "next/image";

/**
 * Logo provisional de EffyOne (recortado al área útil). Se reemplazará por
 * el archivo definitivo (SVG) cuando el proyecto llegue a la Fase 4.
 * El tamaño se controla con className (ej. "w-40").
 */
export function BrandLogo({ className = "w-40" }: { className?: string }) {
  return (
    <div className={`relative aspect-[12/5] shrink-0 overflow-hidden ${className}`}>
      <Image
        src="/brand/effyone-logo.png"
        alt="EffyOne"
        fill
        sizes="320px"
        priority
        className="object-cover mix-blend-lighten"
      />
    </div>
  );
}
