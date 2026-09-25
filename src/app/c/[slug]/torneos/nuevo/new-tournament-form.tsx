"use client";

import { useId, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import type { TiebreakerCode } from "@/types/database";
import { createTournamentAction } from "../actions";

type Props = {
  sports: { value: string; label: string }[];
  canGoPrivate: boolean;
};

const TIEBREAKER_OPTIONS: { key: TiebreakerCode; label: string }[] = [
  { key: "head_to_head", label: "Enfrentamiento directo entre los empatados" },
  { key: "goal_diff", label: "Diferencia de gol" },
  { key: "goals_for", label: "Goles a favor" },
  { key: "wins", label: "Cantidad de victorias" },
  { key: "fewer_cards", label: "Menos tarjetas" },
];

export function NewTournamentForm({ sports, canGoPrivate }: Props) {
  const [format, setFormat] = useState<"round_robin" | "single_elimination">("round_robin");
  const formatGroupId = useId();

  return (
    <ActionForm
      action={createTournamentAction}
      submitLabel="Crear torneo"
      pendingLabel="Creando…"
      className="space-y-6"
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-display text-xl font-bold uppercase tracking-wide">Datos generales</legend>
        <TextField label="Nombre del torneo" name="name" required autoFocus maxLength={120} placeholder="Apertura 2026" />
        <SelectField label="Deporte" name="sport_id" required options={sports} />
        {canGoPrivate ? (
          <div className="sm:col-span-2">
            <CheckboxField
              label="Hacer este torneo privado (oculto del panel público)"
              name="private"
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 font-display text-xl font-bold uppercase tracking-wide">Formato</legend>
        <div role="radiogroup" aria-label="Formato del torneo" className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { value: "round_robin", title: "Liga", desc: "Todos los equipos se enfrentan entre sí." },
              { value: "single_elimination", title: "Eliminatoria directa", desc: "Llave: el que pierde queda eliminado." },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer flex-col gap-1 border p-4 ${
                format === opt.value ? "border-brand bg-asphalt-900" : "border-asphalt-700 bg-asphalt-900"
              }`}
            >
              <span className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
                <input
                  type="radio"
                  name="format"
                  value={opt.value}
                  checked={format === opt.value}
                  onChange={() => setFormat(opt.value)}
                  className="h-5 w-5 accent-[#fed306]"
                  aria-describedby={`${formatGroupId}-${opt.value}`}
                />
                {opt.title}
              </span>
              <span id={`${formatGroupId}-${opt.value}`} className="text-sm text-asphalt-400">
                {opt.desc}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {format === "round_robin" ? (
        <fieldset className="space-y-4">
          <legend className="mb-1 font-display text-xl font-bold uppercase tracking-wide">Parámetros de la Liga</legend>
          <SelectField
            label="Cuántas veces se enfrentan"
            name="round_robin_legs"
            defaultValue="1"
            options={[
              { value: "1", label: "Una vuelta (solo ida)" },
              { value: "2", label: "Ida y vuelta (dos veces)" },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Puntos por victoria" name="win_points" type="number" min={0} max={100} defaultValue={3} required />
            <TextField label="Puntos por empate" name="draw_points" type="number" min={0} max={100} defaultValue={1} required />
            <TextField label="Puntos por derrota" name="loss_points" type="number" min={0} max={100} defaultValue={0} required />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-asphalt-200">
              Criterios de desempate (se aplican en este orden, tras los puntos)
            </p>
            <div className="space-y-2">
              {TIEBREAKER_OPTIONS.map((tb, i) => (
                <CheckboxField key={tb.key} label={`${i + 1}. ${tb.label}`} name={`tb_${tb.key}`} defaultChecked />
              ))}
            </div>
          </div>
        </fieldset>
      ) : (
        <fieldset className="space-y-4">
          <legend className="mb-1 font-display text-xl font-bold uppercase tracking-wide">Parámetros de la Eliminatoria</legend>
          <SelectField
            label="Sorteo de cruces"
            name="bracket_seeding"
            defaultValue="random"
            options={[
              { value: "random", label: "Sorteo aleatorio (lo hace el sistema)" },
              { value: "manual", label: "Yo arreglo los cruces manualmente" },
            ]}
            hint="El sorteo o los cruces se generan cuando armes el calendario, en la ficha del torneo."
          />
          <CheckboxField label="Jugar un partido por el tercer puesto" name="third_place_match" />
        </fieldset>
      )}

      <fieldset className="space-y-4">
        <legend className="mb-1 font-display text-xl font-bold uppercase tracking-wide">Disciplina</legend>
        <p className="text-sm text-asphalt-400">
          Define cuándo un jugador queda suspendido por acumulación de tarjetas. El control de tarjetas y
          suspensiones automáticas se activa en una fase posterior; aquí solo defines las reglas.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Amarillas para suspender"
            name="discipline_yellow_for_suspension"
            type="number"
            min={2}
            max={10}
            placeholder="Sin sanción automática"
            hint="Déjalo vacío para no sancionar por acumulación."
          />
          <TextField
            label="Partidos de sanción (amarillas)"
            name="discipline_suspension_matches"
            type="number"
            min={1}
            max={10}
            defaultValue={1}
            required
          />
          <TextField
            label="Partidos de sanción (roja directa)"
            name="discipline_red_suspension_matches"
            type="number"
            min={1}
            max={10}
            defaultValue={1}
            required
          />
        </div>
        <CheckboxField
          label="Reiniciar las tarjetas acumuladas al pasar de fase (si el torneo tiene varias fases)"
          name="discipline_cards_reset_between_stages"
        />
      </fieldset>
    </ActionForm>
  );
}
