import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import { ROLE_LABELS } from "@/lib/auth/labels";
import type { SessionContext } from "@/lib/auth/session";

/** Cabecera común de los paneles autenticados. */
export function AppHeader({
  ctx,
  context,
}: {
  ctx: SessionContext;
  /** Texto de contexto: nombre del complejo o "Backoffice". */
  context: string;
}) {
  return (
    <header className="border-b border-asphalt-700 bg-asphalt-900">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <BrandLogo className="w-24 sm:w-28" />
        <div className="hidden h-8 w-px bg-asphalt-700 sm:block" />
        <p className="min-w-0 flex-1 truncate font-display text-xl font-bold uppercase tracking-wide">
          {context}
        </p>
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight">{ctx.profile.full_name}</p>
          <p className="text-xs uppercase tracking-widest text-asphalt-400">
            {ROLE_LABELS[ctx.profile.role]}
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary" className="h-10 px-4 text-base">
            Salir
          </Button>
        </form>
      </div>
    </header>
  );
}
