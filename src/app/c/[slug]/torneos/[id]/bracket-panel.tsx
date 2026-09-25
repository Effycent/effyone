import { ActionForm } from "@/components/action-form";
import { FeatureGate } from "@/components/feature-gate";
import { Panel } from "@/components/ui/panel";
import { formatDateTimeIn } from "@/lib/billing/labels";
import { bracketSize, roundName, sideLabel } from "@/lib/bracket";
import type { Match, TournamentStage } from "@/types/database";
import { clearFixtureAction } from "../fixture-actions";
import { BracketGenerateForm } from "./bracket-generate-form";
import { MatchRow } from "./match-row";

type Props = {
  slug: string;
  tournamentId: string;
  stage: TournamentStage;
  matches: Match[];
  teamNames: Map<string, string>;
  /** Equipos con inscripción vigente. */
  registeredTeams: { id: string; name: string }[];
  timezone: string;
  canEdit: boolean;
};

/** Llave de eliminación directa: generación, rondas y agenda de cada partido. */
export function BracketPanel({
  slug,
  tournamentId,
  stage,
  matches,
  teamNames,
  registeredTeams,
  timezone,
  canEdit,
}: Props) {
  const matchesById = new Map(matches.map((m) => [m.id, m]));
  const totalRounds = Math.max(0, ...matches.map((m) => m.round_number));
  const locked = matches.some((m) => m.status !== "scheduled");
  const size = bracketSize(registeredTeams.length);

  // ¿La llave quedó desactualizada respecto a los equipos inscritos?
  const inBracket = new Set(matches.flatMap((m) => [m.home_entry_id, m.away_entry_id].filter((x): x is string => !!x)));
  const registered = new Set(registeredTeams.map((t) => t.id));
  const missing = registeredTeams.filter((t) => !inBracket.has(t.id)).length;
  const withdrawn = [...inBracket].filter((id) => !registered.has(id)).length;
  const outdated = matches.length > 0 && (missing > 0 || withdrawn > 0);

  // En la ronda 1 hay lugares libres si menos equipos que la potencia de 2.
  const byeTeams = matches.length
    ? [...inBracket].filter((id) => !matches.some((m) => m.round_number === 1 && (m.home_entry_id === id || m.away_entry_id === id)))
    : [];

  const rounds = new Map<number, Match[]>();
  for (const m of matches) rounds.set(m.round_number, [...(rounds.get(m.round_number) ?? []), m]);
  const sortedRounds = [...rounds.entries()].sort((a, b) => a[0] - b[0]);

  const form = (label: string, variant: "primary" | "secondary", confirm?: string) => (
    <BracketGenerateForm
      stageId={stage.id}
      tournamentId={tournamentId}
      teams={registeredTeams}
      size={size}
      defaultSeeding={stage.bracket_seeding ?? "random"}
      defaultThirdPlace={stage.third_place_match ?? false}
      submitLabel={label}
      variant={variant}
      confirmMessage={confirm}
    />
  );

  return (
    <Panel
      title="Llave eliminatoria"
      description={`${registeredTeams.length} equipos inscritos${size > registeredTeams.length && registeredTeams.length >= 2 ? ` · ${size - registeredTeams.length} pasan directo a la segunda ronda` : ""}`}
    >
      {outdated ? (
        <p className="mb-4 border-l-4 border-brand bg-asphalt-900 px-4 py-3 text-sm text-asphalt-200">
          Los equipos inscritos cambiaron después de generar la llave
          {missing > 0 ? ` (${missing} equipo(s) no están en ella)` : ""}
          {withdrawn > 0 ? ` (${withdrawn} equipo(s) retirado(s) siguen en ella)` : ""}.
          {locked ? " Como ya hay partidos iniciados, no se puede regenerar." : " Vuelve a generarla para reflejar los cambios."}
        </p>
      ) : null}

      {matches.length === 0 ? (
        <>
          <p className="mb-4 text-sm text-asphalt-200">
            {registeredTeams.length < 2
              ? "Inscribe al menos 2 equipos para poder generar la llave."
              : "Genera los cruces. Cuando el número de equipos no es potencia de 2, algunos equipos pasan directo a la segunda ronda."}
          </p>
          {canEdit && registeredTeams.length >= 2 ? (
            <FeatureGate slug={slug} feature="auto_fixtures">
              {form("Generar llave", "primary")}
            </FeatureGate>
          ) : null}
        </>
      ) : (
        <div className="space-y-6">
          {byeTeams.length > 0 ? (
            <p className="text-sm text-asphalt-400">
              Pasan directo a la segunda ronda: {byeTeams.map((id) => teamNames.get(id) ?? "Equipo").join(", ")}.
            </p>
          ) : null}

          <div className="space-y-4">
            {sortedRounds.map(([round, list]) => {
              const main = list.filter((m) => !m.is_third_place).sort((a, b) => a.slot - b.slot);
              const third = list.filter((m) => m.is_third_place);
              const date = new Set(list.map((m) => m.scheduled_at));
              const [onlyDate] = [...date];
              return (
                <section key={round} className="border border-asphalt-700 bg-asphalt-900">
                  <header className="flex flex-wrap items-center gap-3 border-b border-asphalt-700 px-4 py-2">
                    <h3 className="font-display text-xl font-bold uppercase tracking-wide">{roundName(round, totalRounds)}</h3>
                    {date.size === 1 && onlyDate ? (
                      <span className="text-xs text-asphalt-400">{formatDateTimeIn(onlyDate, timezone)}</span>
                    ) : null}
                  </header>
                  <ul className="divide-y divide-asphalt-800">
                    {[...main, ...third].map((m) => {
                      const home = sideLabel("home", m, matchesById, teamNames, totalRounds);
                      const away = sideLabel("away", m, matchesById, teamNames, totalRounds);
                      return (
                        <MatchRow
                          key={m.id}
                          match={m}
                          homeLabel={home.text}
                          awayLabel={away.text}
                          homePending={home.pending}
                          awayPending={away.pending}
                          tag={m.is_third_place ? "Tercer puesto" : undefined}
                          tournamentId={tournamentId}
                          timezone={timezone}
                          canEdit={canEdit}
                        />
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          {canEdit && !locked ? (
            <div className="grid gap-6 border-t border-asphalt-700 pt-6 lg:grid-cols-2">
              <div className="space-y-3">
                <h3 className="font-display text-xl font-bold uppercase tracking-wide">Regenerar llave</h3>
                <p className="text-sm text-asphalt-400">
                  Reemplaza todos los cruces, fechas y sedes. Solo es posible mientras ningún partido haya empezado.
                </p>
                <FeatureGate slug={slug} feature="auto_fixtures">
                  {form(
                    "Regenerar llave",
                    "secondary",
                    "Se reemplazará toda la llave actual, incluidas las fechas y sedes que hayas editado. ¿Continuar?",
                  )}
                </FeatureGate>
              </div>
              <div className="space-y-3">
                <h3 className="font-display text-xl font-bold uppercase tracking-wide">Borrar llave</h3>
                <p className="text-sm text-asphalt-400">Elimina todos los partidos para empezar de cero.</p>
                <ActionForm
                  action={clearFixtureAction}
                  submitLabel="Borrar llave"
                  variant="danger"
                  compact
                  confirmMessage="¿Borrar toda la llave?"
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
              Hay partidos iniciados o finalizados: la llave ya no se puede regenerar ni borrar.
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
