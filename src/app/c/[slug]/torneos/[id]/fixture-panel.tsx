import { ActionForm } from "@/components/action-form";
import { FeatureGate } from "@/components/feature-gate";
import { Badge } from "@/components/ui/badge";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { formatDateTimeIn, toLocalInputValue } from "@/lib/billing/labels";
import type { Match, TournamentStage } from "@/types/database";
import { clearFixtureAction, generateFixtureAction, setMatchScheduleAction } from "../fixture-actions";

type Props = {
  slug: string;
  tournamentId: string;
  stage: TournamentStage;
  matches: Match[];
  /** Nombre de cada inscripción (entry_id → nombre del equipo). */
  teamNames: Map<string, string>;
  /** Inscripciones vigentes (status = registered). */
  registeredEntryIds: string[];
  timezone: string;
  canEdit: boolean;
};

const MATCH_STATUS_LABEL: Record<string, string> = {
  in_progress: "En juego",
  finished: "Finalizado",
  canceled: "Cancelado",
};

/** Fecha de la jornada, solo si TODOS sus partidos comparten la misma. */
function roundDate(list: Match[]): string | null {
  const dates = new Set(list.map((m) => m.scheduled_at));
  const [only] = [...dates];
  return dates.size === 1 && only ? only : null;
}

/** Calendario de una Liga: generación, jornadas, descansos y agenda de cada partido. */
export function FixturePanel({
  slug,
  tournamentId,
  stage,
  matches,
  teamNames,
  registeredEntryIds,
  timezone,
  canEdit,
}: Props) {
  const name = (id: string | null) => (id ? (teamNames.get(id) ?? "Equipo") : "Por definir");

  // ¿El calendario quedó desactualizado respecto a los equipos inscritos?
  const inFixture = new Set(matches.flatMap((m) => [m.home_entry_id, m.away_entry_id].filter((x): x is string => !!x)));
  const registered = new Set(registeredEntryIds);
  const missing = registeredEntryIds.filter((id) => !inFixture.has(id));
  const withdrawnInFixture = [...inFixture].filter((id) => !registered.has(id));
  const outdated = matches.length > 0 && (missing.length > 0 || withdrawnInFixture.length > 0);

  const locked = matches.some((m) => m.status !== "scheduled");

  // Jornadas
  const rounds = new Map<number, Match[]>();
  for (const m of matches) rounds.set(m.round_number, [...(rounds.get(m.round_number) ?? []), m]);
  const sortedRounds = [...rounds.entries()].sort((a, b) => a[0] - b[0]);
  const legsRounds = stage.round_robin_legs === 2 ? Math.max(...rounds.keys(), 0) / 2 : Infinity;

  const generateForm = (label: string, variant: "primary" | "secondary" | "danger", confirm?: string) => (
    <ActionForm
      action={generateFixtureAction}
      submitLabel={label}
      pendingLabel="Generando…"
      variant={variant}
      confirmMessage={confirm}
      className="space-y-4"
    >
      <input type="hidden" name="stage_id" value={stage.id} />
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Primera jornada (opcional)"
          name="first_date"
          type="date"
          hint="Déjalo vacío para asignar las fechas después."
        />
        <TextField
          label="Días entre jornadas"
          name="days_between_rounds"
          type="number"
          min={1}
          max={60}
          defaultValue={7}
          required
        />
        <TextField label="Hora de inicio" name="kickoff_time" type="time" defaultValue="15:00" required />
      </div>
      <CheckboxField label="Sortear el orden de los cruces" name="shuffle" defaultChecked />
    </ActionForm>
  );

  return (
    <Panel
      title="Calendario"
      description={
        stage.round_robin_legs === 2
          ? `Liga de ida y vuelta · ${registeredEntryIds.length} equipos inscritos`
          : `Liga de una vuelta · ${registeredEntryIds.length} equipos inscritos`
      }
    >
      {outdated ? (
        <p className="mb-4 border-l-4 border-brand bg-asphalt-900 px-4 py-3 text-sm text-asphalt-200">
          Los equipos inscritos cambiaron después de generar el calendario
          {missing.length > 0 ? ` (${missing.length} equipo(s) no están en él)` : ""}
          {withdrawnInFixture.length > 0 ? ` (${withdrawnInFixture.length} equipo(s) retirado(s) siguen en él)` : ""}.
          {locked ? " Como ya hay partidos iniciados, no se puede regenerar." : " Vuelve a generarlo para reflejar los cambios."}
        </p>
      ) : null}

      {matches.length === 0 ? (
        <>
          <p className="mb-4 text-sm text-asphalt-200">
            {registeredEntryIds.length < 2
              ? "Inscribe al menos 2 equipos para poder generar el calendario."
              : "Genera el calendario con todos los cruces. Si el número de equipos es impar, uno descansa cada jornada."}
          </p>
          {canEdit && registeredEntryIds.length >= 2 ? (
            <FeatureGate slug={slug} feature="auto_fixtures">
              {generateForm("Generar calendario", "primary")}
            </FeatureGate>
          ) : null}
        </>
      ) : (
        <div className="space-y-6">
          <div className="space-y-4">
            {sortedRounds.map(([round, list]) => {
              const playing = new Set(list.flatMap((m) => [m.home_entry_id, m.away_entry_id]));
              const resting = [...inFixture].filter((id) => !playing.has(id));
              const isReturn = stage.round_robin_legs === 2 && round > legsRounds;
              return (
                <section key={round} className="border border-asphalt-700 bg-asphalt-900">
                  <header className="flex flex-wrap items-center gap-3 border-b border-asphalt-700 px-4 py-2">
                    <h3 className="font-display text-xl font-bold uppercase tracking-wide">Jornada {round}</h3>
                    {stage.round_robin_legs === 2 ? <Badge>{isReturn ? "Vuelta" : "Ida"}</Badge> : null}
                    {roundDate(list) ? (
                      <span className="text-xs text-asphalt-400">{formatDateTimeIn(roundDate(list)!, timezone)}</span>
                    ) : null}
                  </header>
                  <ul className="divide-y divide-asphalt-800">
                    {list.map((m) => (
                      <li key={m.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="min-w-0 flex-1 font-medium">
                            {name(m.home_entry_id)} <span className="px-1 text-asphalt-400">vs</span> {name(m.away_entry_id)}
                          </span>
                          <span className="text-xs text-asphalt-400">
                            {m.scheduled_at ? formatDateTimeIn(m.scheduled_at, timezone) : "Sin fecha"}
                            {m.venue ? ` · ${m.venue}` : ""}
                          </span>
                          {m.status !== "scheduled" ? <Badge tone="warn">{MATCH_STATUS_LABEL[m.status]}</Badge> : null}
                        </div>
                        {canEdit && m.status === "scheduled" ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-asphalt-400 hover:text-white">
                              Editar fecha y sede
                            </summary>
                            <ActionForm
                              action={setMatchScheduleAction}
                              submitLabel="Guardar"
                              compact
                              className="mt-3 grid gap-3 sm:grid-cols-[14rem_1fr_auto] sm:items-end"
                            >
                              <input type="hidden" name="match_id" value={m.id} />
                              <input type="hidden" name="tournament_id" value={tournamentId} />
                              <TextField
                                label="Fecha y hora"
                                name="scheduled_local"
                                type="datetime-local"
                                defaultValue={m.scheduled_at ? toLocalInputValue(m.scheduled_at, timezone) : ""}
                              />
                              <TextField label="Sede (opcional)" name="venue" defaultValue={m.venue ?? ""} maxLength={120} />
                            </ActionForm>
                          </details>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {resting.length > 0 ? (
                    <p className="border-t border-asphalt-800 px-4 py-2 text-xs text-asphalt-400">
                      Descansa: {resting.map((id) => name(id)).join(", ")}
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>

          {canEdit && !locked ? (
            <div className="grid gap-6 border-t border-asphalt-700 pt-6 lg:grid-cols-2">
              <div className="space-y-3">
                <h3 className="font-display text-xl font-bold uppercase tracking-wide">Regenerar calendario</h3>
                <p className="text-sm text-asphalt-400">
                  Reemplaza todo el calendario (cruces, fechas y sedes). Solo es posible mientras ningún partido haya empezado.
                </p>
                <FeatureGate slug={slug} feature="auto_fixtures">
                  {generateForm(
                    "Regenerar calendario",
                    "secondary",
                    "Se reemplazará todo el calendario actual, incluidas las fechas y sedes que hayas editado. ¿Continuar?",
                  )}
                </FeatureGate>
              </div>
              <div className="space-y-3">
                <h3 className="font-display text-xl font-bold uppercase tracking-wide">Borrar calendario</h3>
                <p className="text-sm text-asphalt-400">Elimina todos los partidos para empezar de cero.</p>
                <ActionForm
                  action={clearFixtureAction}
                  submitLabel="Borrar calendario"
                  variant="danger"
                  compact
                  confirmMessage="¿Borrar todo el calendario?"
                  className="space-y-2"
                >
                  <input type="hidden" name="stage_id" value={stage.id} />
                  <input type="hidden" name="tournament_id" value={tournamentId} />
                </ActionForm>
              </div>
            </div>
          ) : null}
          {locked ? (
            <p className="text-sm text-asphalt-400">
              Hay partidos iniciados o finalizados: el calendario ya no se puede regenerar ni borrar.
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
