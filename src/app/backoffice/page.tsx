import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Backoffice" };

const dateFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

export default async function BackofficePage() {
  const ctx = await requireSuperAdmin();
  const supabase = await createClient();

  const [{ data: tenants }, { data: profiles }] = await Promise.all([
    supabase.from("tenants").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, tenant_id, role, is_active"),
  ]);

  const tenantRows = tenants ?? [];
  const profileRows = profiles ?? [];
  const usersByTenant = new Map<string, number>();
  for (const p of profileRows) {
    if (p.tenant_id) usersByTenant.set(p.tenant_id, (usersByTenant.get(p.tenant_id) ?? 0) + 1);
  }
  const activeUsers = profileRows.filter((p) => p.is_active && p.role !== "super_admin").length;

  return (
    <>
      <AppHeader ctx={ctx} context="Backoffice" />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Clientes" value={tenantRows.length} />
          <Stat label="Usuarios activos" value={activeUsers} />
        </section>

        <section className="border border-asphalt-700 bg-asphalt-850">
          <div className="flex items-center justify-between border-b border-asphalt-700 px-5 py-4">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Clientes</h2>
            <span className="text-xs uppercase tracking-widest text-asphalt-400">
              {tenantRows.length} en total
            </span>
          </div>

          {tenantRows.length === 0 ? (
            <p className="px-5 py-10 text-sm text-asphalt-200">
              Todavía no hay clientes registrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-asphalt-700 text-xs uppercase tracking-widest text-asphalt-400">
                    <th className="px-5 py-3 font-semibold">Cliente</th>
                    <th className="px-5 py-3 font-semibold">Dirección</th>
                    <th className="px-5 py-3 font-semibold">País</th>
                    <th className="px-5 py-3 font-semibold">Zona horaria</th>
                    <th className="px-5 py-3 text-right font-semibold">Usuarios</th>
                    <th className="px-5 py-3 font-semibold">Alta</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantRows.map((t) => (
                    <tr key={t.id} className="border-b border-asphalt-800 last:border-0">
                      <td className="px-5 py-3 font-medium">{t.name}</td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/c/${t.slug}`}
                          className="text-asphalt-200 underline decoration-asphalt-600 underline-offset-4 hover:text-white"
                        >
                          /c/{t.slug}
                        </Link>
                      </td>
                      <td className="px-5 py-3">{t.country}</td>
                      <td className="px-5 py-3 text-asphalt-200">{t.timezone}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {usersByTenant.get(t.id) ?? 0}
                      </td>
                      <td className="px-5 py-3 text-asphalt-200">
                        {dateFormat.format(new Date(t.created_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-asphalt-700 bg-asphalt-850 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-asphalt-400">{label}</p>
      <p className="mt-2 font-display text-6xl font-extrabold leading-none tabular-nums">{value}</p>
    </div>
  );
}
