import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5 text-center">
      <BrandLogo className="w-40" />
      <p className="font-display text-8xl font-extrabold leading-none text-brand">404</p>
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide">
        Página no encontrada
      </h1>
      <p className="max-w-sm text-sm text-asphalt-200">
        La dirección no existe o no tienes acceso a ella.
      </p>
      <Link
        href="/"
        className="inline-flex h-12 items-center bg-brand px-6 font-display text-lg font-bold uppercase tracking-wide text-black hover:bg-brand-strong"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
