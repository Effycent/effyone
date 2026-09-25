"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { generateBracketAction } from "../fixture-actions";

type Props = {
  stageId: string;
  tournamentId: string;
  teams: { id: string; name: string }[];
  /** Tamaño de la primera ronda (potencia de 2). */
  size: number;
  defaultSeeding: "random" | "manual";
  defaultThirdPlace: boolean;
  submitLabel: string;
  variant: "primary" | "secondary";
  confirmMessage?: string;
};

/** Formulario de la llave: sorteo aleatorio o cruces armados a mano. */
export function BracketGenerateForm({
  stageId,
  tournamentId,
  teams,
  size,
  defaultSeeding,
  defaultThirdPlace,
  submitLabel,
  variant,
  confirmMessage,
}: Props) {
  const [seeding, setSeeding] = useState<"random" | "manual">(defaultSeeding);
  const freeSpots = size - teams.length;
  const options = [
    { value: "", label: "— Lugar libre (pasa directo) —" },
    ...teams.map((t) => ({ value: t.id, label: t.name })),
  ];

  return (
    <ActionForm
      action={generateBracketAction}
      submitLabel={submitLabel}
      pendingLabel="Generando…"
      variant={variant}
      confirmMessage={confirmMessage}
      className="space-y-4"
    >
      <input type="hidden" name="stage_id" value={stageId} />
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="slot_count" value={size} />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Cruces de la primera ronda"
          name="seeding"
          value={seeding}
          onChange={(e) => setSeeding(e.target.value as "random" | "manual")}
          options={[
            { value: "random", label: "Sorteo aleatorio (lo hace el sistema)" },
            { value: "manual", label: "Los armo yo manualmente" },
          ]}
        />
        <div className="flex items-end pb-3">
          <CheckboxField label="Jugar un partido por el tercer puesto" name="third_place" defaultChecked={defaultThirdPlace} />
        </div>
      </div>

      {seeding === "manual" ? (
        <fieldset className="space-y-3 border border-asphalt-700 bg-asphalt-900 p-4">
          <legend className="px-2 font-display text-lg font-bold uppercase tracking-wide">Cruces de la primera ronda</legend>
          <p className="text-sm text-asphalt-400">
            Elige quién juega contra quién.{" "}
            {freeSpots > 0
              ? `Con ${teams.length} equipos, deja exactamente ${freeSpots} lugar(es) libre(s): el equipo que enfrente un lugar libre pasa directo a la siguiente ronda.`
              : "Todos los lugares deben tener un equipo."}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: size / 2 }, (_, k) => (
              <div key={k} className="space-y-2 border border-asphalt-800 p-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-asphalt-400">Cruce {k + 1}</p>
                <SelectField label="Local" name={`slot_${2 * k + 1}`} defaultValue="" options={options} />
                <SelectField label="Visitante" name={`slot_${2 * k + 2}`} defaultValue="" options={options} />
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Primera ronda (opcional)"
          name="first_date"
          type="date"
          hint="Déjalo vacío para asignar las fechas después."
        />
        <TextField label="Días entre rondas" name="days_between_rounds" type="number" min={1} max={60} defaultValue={7} required />
        <TextField label="Hora de inicio" name="kickoff_time" type="time" defaultValue="15:00" required />
      </div>
    </ActionForm>
  );
}
