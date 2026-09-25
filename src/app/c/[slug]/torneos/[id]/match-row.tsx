import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { TextField } from "@/components/ui/text-field";
import { formatDateTimeIn, toLocalInputValue } from "@/lib/billing/labels";
import type { Match } from "@/types/database";
import { setMatchScheduleAction } from "../fixture-actions";

const MATCH_STATUS_LABEL: Record<string, string> = {
  in_progress: "En juego",
  finished: "Finalizado",
  canceled: "Cancelado",
};

type Props = {
  match: Match;
  /** Texto de cada lado: nombre del equipo o, en llaves, "Ganador de Cuartos 1". */
  homeLabel: string;
  awayLabel: string;
  /** true = el lado aún no está definido (se muestra atenuado). */
  homePending?: boolean;
  awayPending?: boolean;
  tournamentId: string;
  timezone: string;
  canEdit: boolean;
  /** Etiqueta opcional junto al partido, ej. "Tercer puesto". */
  tag?: string;
};

/** Un partido del calendario o de la llave, con su agenda editable. */
export function MatchRow({
  match: m,
  homeLabel,
  awayLabel,
  homePending = false,
  awayPending = false,
  tournamentId,
  timezone,
  canEdit,
  tag,
}: Props) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="min-w-0 flex-1 font-medium">
          <span className={homePending ? "text-asphalt-400" : ""}>{homeLabel}</span>
          <span className="px-2 text-asphalt-400">vs</span>
          <span className={awayPending ? "text-asphalt-400" : ""}>{awayLabel}</span>
        </span>
        {tag ? <Badge>{tag}</Badge> : null}
        <span className="text-xs text-asphalt-400">
          {m.scheduled_at ? formatDateTimeIn(m.scheduled_at, timezone) : "Sin fecha"}
          {m.venue ? ` · ${m.venue}` : ""}
        </span>
        {m.status !== "scheduled" ? <Badge tone="warn">{MATCH_STATUS_LABEL[m.status]}</Badge> : null}
      </div>
      {canEdit && m.status === "scheduled" ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-asphalt-400 hover:text-white">Editar fecha y sede</summary>
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
  );
}
