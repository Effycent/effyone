import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createSportAction, updateSportAction } from "./actions";

export const metadata: Metadata = { title: "Deportes" };

export default async function SportsPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const [{ data: sports }, { data: tournaments }] = await Promise.all([
    supabase.from("sports").select("*").order("name"),
    supabase.from("tournaments").select("sport_id"),
  ]);

  const usage = new Map<string, number>();
  for (const t of tournaments ?? []) usage.set(t.sport_id, (usage.get(t.sport_id) ?? 0) + 1);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel
        title="Deportes"
        description="El sistema es agnóstico: cualquier deporte funciona con los mismos Parámetros de Decisión de cada torneo. Aquí solo defines el nombre que ven tus clientes."
      >
        <ul className="divide-y divide-asphalt-800">
          {(sports ?? []).map((sport) => (
            <li key={sport.id} className="py-4 first:pt-0 last:pb-0">
              <ActionForm action={updateSportAction} submitLabel="Guardar" compact className="space-y-3">
                <input type="hidden" name="sport_id" value={sport.id} />
                <div className="flex flex-wrap items-center gap-3">
                  <TextField label="Nombre" name="name" defaultValue={sport.name} required maxLength={60} className="max-w-xs" />
                  <Badge>{sport.code}</Badge>
                  <span className="text-xs text-asphalt-400">
                    {usage.get(sport.id) ?? 0} torneo(s) lo usan
                  </span>
                </div>
                <CheckboxField
                  label="Disponible para nuevos torneos"
                  name="is_active"
                  defaultChecked={sport.is_active}
                />
              </ActionForm>
            </li>
          ))}
          {(sports ?? []).length === 0 ? (
            <li className="py-2 text-sm text-asphalt-200">Todavía no hay deportes registrados.</li>
          ) : null}
        </ul>
      </Panel>

      <Panel title="Nuevo deporte">
        <ActionForm action={createSportAction} submitLabel="Crear deporte" resetOnSuccess className="space-y-4">
          <TextField label="Nombre" name="name" required maxLength={60} placeholder="Baloncesto" />
          <TextField
            label="Código"
            name="code"
            required
            maxLength={40}
            autoCapitalize="none"
            placeholder="baloncesto"
            hint="Identificador interno. No se puede cambiar después."
          />
        </ActionForm>
      </Panel>
    </div>
  );
}
