import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { updateSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data: settings } = await supabase.from("platform_settings").select("*").single();

  return (
    <Panel
      title="Suscripciones"
      description="Reglas globales de mora y conservación de datos. Aplican a todos los clientes de pago."
      className="max-w-2xl"
    >
      {settings ? (
        <ActionForm action={updateSettingsAction} submitLabel="Guardar ajustes" className="space-y-5">
          <TextField
            label="Días de gracia"
            name="grace_days"
            inputMode="numeric"
            defaultValue={String(settings.grace_days)}
            required
            hint="Desde que marcas “En mora”, el cliente sigue con todo funcionando estos días; después pasa a solo lectura."
          />
          <TextField
            label="Días de conservación tras cancelar"
            name="canceled_retention_days"
            inputMode="numeric"
            defaultValue={String(settings.canceled_retention_days)}
            required
            hint="Pasado este plazo podrás eliminar definitivamente al cliente cancelado."
          />
        </ActionForm>
      ) : (
        <p className="text-sm text-asphalt-200">No se pudieron leer los ajustes.</p>
      )}
    </Panel>
  );
}
