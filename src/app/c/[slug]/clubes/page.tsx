import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { createClient } from "@/lib/supabase/server";
import { requireTenantManagerPage } from "@/lib/tenant/panel";
import { createTeamAction, updateTeamAction } from "./actions";

export const metadata: Metadata = { title: "Clubes" };

export default async function ClubsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const panel = await requireTenantManagerPage(slug);

  const supabase = await createClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("*")
    .eq("tenant_id", panel.tenant.id)
    .order("name");

  const canEdit = panel.canManage && panel.canWrite;

  return (
    <>
      <Panel
        title="Clubes"
        description="Los equipos de tu complejo. Se crean una sola vez y luego los inscribes en cada torneo."
      >
        {(teams ?? []).length === 0 ? (
          <p className="text-sm text-asphalt-200">Todavía no registras ningún equipo.</p>
        ) : (
          <ul className="divide-y divide-asphalt-800">
            {(teams ?? []).map((team) => (
              <li key={team.id} className="py-4 first:pt-0 last:pb-0">
                {canEdit ? (
                  <ActionForm action={updateTeamAction} submitLabel="Guardar" compact className="space-y-3">
                    <input type="hidden" name="team_id" value={team.id} />
                    <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                      <TextField label="Nombre" name="name" defaultValue={team.name} required maxLength={80} />
                      <TextField label="Sigla (opcional)" name="short_name" defaultValue={team.short_name ?? ""} maxLength={12} />
                    </div>
                  </ActionForm>
                ) : (
                  <p className="font-medium">
                    {team.name}
                    {team.short_name ? <span className="ml-2 text-sm text-asphalt-400">{team.short_name}</span> : null}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {!canEdit && panel.canManage ? (
          <p className="mt-4 text-sm text-asphalt-400">Tu cuenta está en solo lectura: no se pueden crear ni editar equipos.</p>
        ) : null}
      </Panel>

      {canEdit ? (
        <Panel title="Nuevo club">
          <ActionForm action={createTeamAction} submitLabel="Crear equipo" pendingLabel="Creando…" resetOnSuccess className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <TextField label="Nombre" name="name" required maxLength={80} placeholder="Deportivo Norte" />
              <TextField label="Sigla (opcional)" name="short_name" maxLength={12} placeholder="NORTE" />
            </div>
          </ActionForm>
        </Panel>
      ) : null}
    </>
  );
}
