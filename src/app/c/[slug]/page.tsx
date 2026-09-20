import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { ROLE_LABELS } from "@/lib/auth/labels";
import { requireTenantAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Panel del complejo" };

export default async function TenantHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx, tenant, isSupportView } = await requireTenantAccess(slug);

  // RLS: un Administrador ve a todo su equipo; un Operador solo a sí mismo.
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("tenant_id", tenant.id)
    .order("full_name");

  return (
    <>
      <AppHeader ctx={ctx} context={tenant.name} />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        {isSupportView ? (
          <p className="border-l-4 border-brand bg-asphalt-900 px-4 py-3 text-sm text-asphalt-200">
            Vista de soporte: estás viendo el panel de este cliente como Super Admin.
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <section className="border border-asphalt-700 bg-asphalt-850 p-5">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Complejo</h2>
            <dl className="mt-4 divide-y divide-asphalt-800 text-sm">
              <Row label="Nombre" value={tenant.name} />
              <Row label="Dirección" value={`/c/${tenant.slug}`} />
              <Row label="País" value={tenant.country} />
              <Row label="Zona horaria" value={tenant.timezone} />
            </dl>
          </section>

          <section className="border border-asphalt-700 bg-asphalt-850">
            <div className="flex items-center justify-between border-b border-asphalt-700 px-5 py-4">
              <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Equipo</h2>
              <span className="text-xs uppercase tracking-widest text-asphalt-400">
                {members?.length ?? 0} usuarios
              </span>
            </div>
            <ul className="divide-y divide-asphalt-800">
              {(members ?? []).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="font-medium">{m.full_name}</span>
                  <span className="flex items-center gap-3">
                    {m.is_active ? null : (
                      <span className="text-xs uppercase tracking-widest text-danger">
                        Inactivo
                      </span>
                    )}
                    <span className="text-xs uppercase tracking-widest text-asphalt-400">
                      {ROLE_LABELS[m.role]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-asphalt-400">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
