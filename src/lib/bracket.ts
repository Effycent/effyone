import type { Match } from "@/types/database";

/** Nombre de una ronda según su distancia a la final. */
export function roundName(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return "Final";
  if (fromFinal === 1) return "Semifinales";
  if (fromFinal === 2) return "Cuartos de final";
  if (fromFinal === 3) return "Octavos de final";
  if (fromFinal === 4) return "Dieciseisavos de final";
  return `Ronda ${round}`;
}

/** Singular para las referencias ("Ganador de Semifinal 1"). */
export function roundNameSingular(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return "la Final";
  if (fromFinal === 1) return "Semifinal";
  if (fromFinal === 2) return "Cuartos";
  if (fromFinal === 3) return "Octavos";
  if (fromFinal === 4) return "Dieciseisavos";
  return `Ronda ${round}`;
}

/** Tamaño de la primera ronda: la siguiente potencia de 2 (mínimo 2). */
export function bracketSize(teams: number): number {
  let size = 2;
  while (size < teams) size *= 2;
  return size;
}

/**
 * Texto de un lado de un partido de llave: el equipo, o "Ganador de Cuartos 2"
 * si todavía depende de otro partido.
 */
export function sideLabel(
  side: "home" | "away",
  match: Match,
  matchesById: Map<string, Match>,
  teamNames: Map<string, string>,
  totalRounds: number,
): { text: string; pending: boolean } {
  const entryId = side === "home" ? match.home_entry_id : match.away_entry_id;
  if (entryId) return { text: teamNames.get(entryId) ?? "Equipo", pending: false };

  const sourceId = side === "home" ? match.home_source_match_id : match.away_source_match_id;
  const kind = side === "home" ? match.home_source_kind : match.away_source_kind;
  const source = sourceId ? matchesById.get(sourceId) : undefined;
  if (!source) return { text: "Por definir", pending: true };

  // Se numera entre los partidos que EXISTEN en esa ronda (los lugares libres no cuentan).
  const ordinal =
    [...matchesById.values()].filter(
      (m) => m.round_number === source.round_number && !m.is_third_place && m.slot <= source.slot,
    ).length;
  const who = kind === "loser" ? "Perdedor" : "Ganador";
  const where = roundNameSingular(source.round_number, totalRounds);
  return { text: `${who} de ${where} ${ordinal}`, pending: true };
}
