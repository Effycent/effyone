import { CopyButton } from "@/components/ui/copy-button";
import type { Credentials } from "@/lib/actions/state";

/** Muestra una contraseña temporal UNA sola vez (no se guarda en ningún lado). */
export function CredentialsCard({ credentials }: { credentials: Credentials }) {
  const text = `Correo: ${credentials.email}\nContraseña temporal: ${credentials.password}`;
  return (
    <div className="space-y-3 border border-brand bg-asphalt-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand">
        Contraseña temporal · se muestra una sola vez
      </p>
      <dl className="space-y-1 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-asphalt-400">Usuario:</dt>
          <dd className="font-medium">{credentials.name}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-asphalt-400">Correo:</dt>
          <dd className="font-medium">{credentials.email}</dd>
        </div>
        <div className="flex flex-wrap items-center gap-x-2">
          <dt className="text-asphalt-400">Contraseña:</dt>
          <dd className="select-all font-mono text-base font-semibold">{credentials.password}</dd>
        </div>
      </dl>
      <div className="flex items-center gap-3">
        <CopyButton text={text} label="Copiar datos" />
        <p className="text-xs text-asphalt-400">
          Envíasela por un canal seguro. En su primer ingreso deberá crear una propia.
        </p>
      </div>
    </div>
  );
}
