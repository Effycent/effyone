"use client";

import { useRef, type FormEvent } from "react";
import { ActionForm } from "@/components/action-form";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { slugify } from "@/lib/slugify";
import { createTenantAction } from "../actions";

type Props = {
  plans: { value: string; label: string }[];
  defaultPlanId: string;
  countries: { value: string; label: string }[];
  timezones: string[];
};

export function NewTenantForm({ plans, defaultPlanId, countries, timezones }: Props) {
  // La dirección se sugiere desde el nombre hasta que el usuario la edita a mano.
  const slugEdited = useRef(false);

  function onInput(event: FormEvent<HTMLDivElement>) {
    const target = event.target as HTMLInputElement;
    if (target.name === "slug") {
      slugEdited.current = target.value !== "";
      return;
    }
    if (target.name === "name" && !slugEdited.current) {
      const slug = target.form?.elements.namedItem("slug");
      if (slug instanceof HTMLInputElement) slug.value = slugify(target.value);
    }
  }

  return (
    <ActionForm
      action={createTenantAction}
      submitLabel="Crear cliente"
      pendingLabel="Creando…"
      resetOnSuccess
      className="space-y-6"
    >
      <div onInput={onInput} onReset={() => (slugEdited.current = false)} className="space-y-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-display text-xl font-bold uppercase tracking-wide">
            Complejo o club
          </legend>
          <TextField label="Nombre" name="name" required autoFocus maxLength={120} />
          <TextField
            label="Dirección web"
            name="slug"
            required
            maxLength={40}
            autoCapitalize="none"
            hint="Se usará en /c/dirección. Solo minúsculas, números y guiones."
          />
          <SelectField label="País" name="country" defaultValue="EC" options={countries} />
          <SelectField
            label="Zona horaria"
            name="timezone"
            defaultValue="America/Guayaquil"
            options={timezones.map((z) => ({ value: z, label: z }))}
          />
          <div className="sm:col-span-2">
            <SelectField label="Plan" name="plan_id" defaultValue={defaultPlanId} options={plans} />
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-display text-xl font-bold uppercase tracking-wide">
            Primer administrador
          </legend>
          <TextField label="Nombre completo" name="admin_name" required maxLength={120} />
          <TextField
            label="Correo"
            name="admin_email"
            type="email"
            required
            autoCapitalize="none"
            hint="Se le entrega una contraseña temporal que deberá cambiar al ingresar."
          />
        </fieldset>
      </div>
    </ActionForm>
  );
}
