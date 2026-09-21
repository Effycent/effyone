import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { requireSuperAdmin } from "@/lib/auth/session";
import { formatMoney } from "@/lib/billing/labels";
import { COUNTRY_OPTIONS, TIMEZONES } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { NewTenantForm } from "./new-tenant-form";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NewTenantPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  const list = plans ?? [];
  const defaultPlan = list.find((p) => p.is_default) ?? list[0];

  return (
    <>
      <Link href="/backoffice" className="text-sm text-asphalt-400 hover:text-white">
        ← Volver a clientes
      </Link>
      <Panel title="Nuevo cliente" description="Crea el complejo y a su primer administrador en un solo paso.">
        {defaultPlan ? (
          <NewTenantForm
            plans={list.map((p) => ({
              value: p.id,
              label: `${p.name} · ${p.price_cents === 0 ? "Gratis" : `${formatMoney(p.price_cents, p.currency)}/mes`}`,
            }))}
            defaultPlanId={defaultPlan.id}
            countries={COUNTRY_OPTIONS}
            timezones={TIMEZONES}
          />
        ) : (
          <p className="text-sm text-asphalt-200">
            No hay planes activos. Activa o crea un plan en la sección Planes antes de crear clientes.
          </p>
        )}
      </Panel>
    </>
  );
}
