// Prueba automática de la Fase 2.3 (llave de Eliminatoria directa) contra tu
// proyecto Supabase:
//   npm run test:brackets
// Crea datos temporales (prefijo brtest-), los prueba con sesiones reales y
// los borra al terminar. No toca tus datos reales.
import { randomBytes } from "node:crypto";
import { adminClient, anonClient, createUserWithProfile } from "./lib.mjs";

const admin = adminClient();
const suffix = randomBytes(3).toString("hex");
const userIds = [];
const tenantIds = [];
const results = [];

function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `   -> ${detail}` : ""}`);
}

const plans = {};
let futbolId;

async function makeTenant(label, planCode) {
  const { data, error } = await admin
    .from("tenants")
    .insert({
      slug: `brtest-${label}-${suffix}`,
      name: `BR Test ${label.toUpperCase()}`,
      country: "EC",
      timezone: "America/Guayaquil",
      plan_id: plans[planCode],
    })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo crear tenant de prueba: ${error.message}`);
  tenantIds.push(data.id);
  return data;
}

async function makeUser(label, role, tenantId) {
  const user = await createUserWithProfile(admin, {
    email: `brtest-${label}-${suffix}@example.com`,
    fullName: `BR ${label}`,
    role,
    tenantId,
  });
  userIds.push(user.id);
  return user;
}

async function signedIn(user) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`No se pudo iniciar sesión como ${user.email}: ${error.message}`);
  return client;
}

async function setup(client, tenant, n, { format = "single_elimination", third = false, seeding = "random" } = {}) {
  const { data: tournamentId, error } = await client.rpc("create_tournament", {
    p_tenant_id: tenant.id,
    p_sport_id: futbolId,
    p_name: `Copa ${randomBytes(2).toString("hex")}`,
    p_format: format,
    p_bracket_seeding: seeding,
    p_third_place_match: third,
  });
  if (error) throw new Error(`No se pudo crear el torneo: ${error.message}`);
  const { data: stage } = await admin.from("tournament_stages").select("id").eq("tournament_id", tournamentId).single();
  const entryIds = [];
  for (let i = 1; i <= n; i++) {
    const { data: team } = await admin.from("teams").insert({ tenant_id: tenant.id, name: `Eq ${randomBytes(3).toString("hex")} ${i}` }).select("id").single();
    const { data: entry, error: ee } = await admin
      .from("tournament_entries")
      .insert({ tournament_id: tournamentId, team_id: team.id, tenant_id: tenant.id })
      .select("id")
      .single();
    if (ee) throw new Error(`No se pudo inscribir: ${ee.message}`);
    entryIds.push(entry.id);
  }
  return { tournamentId, stageId: stage.id, entryIds };
}

async function matchesOf(stageId) {
  const { data } = await admin.from("matches").select("*").eq("stage_id", stageId).order("round_number").order("slot");
  return data ?? [];
}

const bracket = (client, stageId, extra = {}) =>
  client.rpc("generate_single_elimination_bracket", { p_stage_id: stageId, ...extra });

const pow2 = (n) => {
  let s = 2;
  while (s < n) s *= 2;
  return s;
};

/** Cada equipo aparece exactamente una vez como participante inicial (ronda 1 o pasa directo). */
function leafCounts(ms, entryIds) {
  const counts = new Map(entryIds.map((id) => [id, 0]));
  for (const m of ms) {
    for (const id of [m.home_entry_id, m.away_entry_id]) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

try {
  const { data: p } = await admin.from("plans").select("id, code");
  for (const row of p) plans[row.code] = row.id;
  const { data: sp } = await admin.from("sports").select("id").eq("code", "futbol").single();
  futbolId = sp.id;

  const tGold = await makeTenant("gd", "gold");
  const tBronze = await makeTenant("bz", "bronze");
  const tSilver = await makeTenant("sv", "silver");
  const adminGold = await makeUser("admin-gd", "tenant_admin", tGold.id);
  const opGold = await makeUser("op-gd", "operator", tGold.id);
  const adminBronze = await makeUser("admin-bz", "tenant_admin", tBronze.id);
  const adminSilver = await makeUser("admin-sv", "tenant_admin", tSilver.id);
  const cGold = await signedIn(adminGold);
  const cOp = await signedIn(opGold);
  const cBronze = await signedIn(adminBronze);
  const cSilver = await signedIn(adminSilver);

  console.log("\n== 8 equipos (potencia de 2): sin byes ==");
  {
    const s = await setup(cGold, tGold, 8);
    const r = await bracket(cGold, s.stageId);
    check("Devuelve 7 partidos (4 + 2 + 1)", !r.error && r.data === 7, r.error?.message ?? String(r.data));
    const ms = await matchesOf(s.stageId);
    const byRound = (n) => ms.filter((m) => m.round_number === n);
    check("Ronda 1: 4 cruces; ronda 2: 2; ronda 3 (final): 1", byRound(1).length === 4 && byRound(2).length === 2 && byRound(3).length === 1);
    check("Los 4 cruces de la ronda 1 tienen equipos reales en ambos lados", byRound(1).every((m) => m.home_entry_id && m.away_entry_id && !m.home_source_match_id));
    const counts = leafCounts(ms, s.entryIds);
    check("Cada equipo aparece exactamente una vez como participante inicial", [...counts.values()].every((c) => c === 1));
    const r1ids = new Set(byRound(1).map((m) => m.id));
    check("La ronda 2 toma como origen a los ganadores de la ronda 1", byRound(2).every((m) => r1ids.has(m.home_source_match_id) && r1ids.has(m.away_source_match_id) && m.home_source_kind === "winner" && m.away_source_kind === "winner" && !m.home_entry_id));
    const r2ids = new Set(byRound(2).map((m) => m.id));
    const final = byRound(3)[0];
    check("La final toma a los ganadores de las 2 semifinales", r2ids.has(final.home_source_match_id) && r2ids.has(final.away_source_match_id));
    check("Cada partido de rondas 1 y 2 alimenta exactamente a uno posterior", [...byRound(1), ...byRound(2)].every((m) => ms.filter((x) => x.home_source_match_id === m.id || x.away_source_match_id === m.id).length === 1));
    check("Sin tercer puesto (por defecto)", ms.every((m) => m.is_third_place === false));
    check("Sin fecha: scheduled_at vacío", ms.every((m) => m.scheduled_at === null));
  }

  console.log("\n== Cantidad de partidos = equipos - 1 (con byes incluidos) ==");
  for (const n of [2, 3, 5, 6, 7, 11, 16, 20]) {
    const s = await setup(cGold, tGold, n);
    const r = await bracket(cGold, s.stageId);
    const ms = await matchesOf(s.stageId);
    const counts = leafCounts(ms, s.entryIds);
    check(
      `${n} equipos: ${n - 1} partidos y cada equipo una sola vez`,
      !r.error && ms.length === n - 1 && [...counts.values()].every((c) => c === 1),
      `${r.error?.message ?? ""} partidos=${ms.length}`,
    );
  }

  console.log("\n== 6 equipos: byes en la ronda 2 ==");
  {
    const s = await setup(cGold, tGold, 6);
    await bracket(cGold, s.stageId);
    const ms = await matchesOf(s.stageId);
    const r1 = ms.filter((m) => m.round_number === 1);
    const r2 = ms.filter((m) => m.round_number === 2);
    check("Solo 2 cruces reales en la ronda 1 (4 equipos juegan)", r1.length === 2);
    const direct = r2.flatMap((m) => [m.home_entry_id, m.away_entry_id]).filter(Boolean);
    check("2 equipos pasan directo y ya están ubicados en la ronda 2", direct.length === 2);
    check("Los que pasan directo NO juegan la ronda 1", direct.every((id) => !r1.some((m) => m.home_entry_id === id || m.away_entry_id === id)));
    check("Cada partido de la ronda 2 mezcla un equipo directo y un ganador de la ronda 1", r2.every((m) => (m.home_entry_id ? 1 : 0) + (m.away_entry_id ? 1 : 0) === 1));
    check("Hay 3 rondas (potencia de 2 siguiente = 8)", Math.max(...ms.map((m) => m.round_number)) === 3);
  }

  console.log("\n== Tercer puesto ==");
  {
    const s = await setup(cGold, tGold, 4, { third: true });
    const r = await bracket(cGold, s.stageId);
    check("4 equipos con tercer puesto: 4 partidos", !r.error && r.data === 4, r.error?.message);
    const ms = await matchesOf(s.stageId);
    const third = ms.filter((m) => m.is_third_place);
    const semis = ms.filter((m) => m.round_number === 1);
    check("Hay un solo partido por el tercer puesto, en la ronda de la final", third.length === 1 && third[0].round_number === 2);
    check("Enfrenta a los PERDEDORES de las dos semifinales", third[0].home_source_kind === "loser" && third[0].away_source_kind === "loser" && semis.some((m) => m.id === third[0].home_source_match_id) && semis.some((m) => m.id === third[0].away_source_match_id));
    const final = ms.find((m) => m.round_number === 2 && !m.is_third_place);
    check("La final enfrenta a los GANADORES", final.home_source_kind === "winner" && final.away_source_kind === "winner");

    const p = await setup(cGold, tGold, 4);
    const override = await bracket(cGold, p.stageId, { p_third_place: true });
    check("El tercer puesto también se puede pedir al generar", !override.error && override.data === 4);
    const s16 = await setup(cGold, tGold, 16, { third: true });
    const r16 = await bracket(cGold, s16.stageId);
    check("16 equipos con tercer puesto: 15 + 1 = 16 partidos", !r16.error && r16.data === 16, r16.error?.message);

    const s3 = await setup(cGold, tGold, 3, { third: true });
    const r3 = await bracket(cGold, s3.stageId);
    check("3 equipos NO admiten tercer puesto (no hay dos semifinales)", !!r3.error && /tercer puesto/i.test(r3.error.message), r3.error?.message);
    const s2 = await setup(cGold, tGold, 2, { third: true });
    const r2 = await bracket(cGold, s2.stageId);
    check("2 equipos NO admiten tercer puesto (solo final)", !!r2.error && /tercer puesto/i.test(r2.error.message), r2.error?.message);
    const noThird = await bracket(cGold, s3.stageId, { p_third_place: false });
    check("Pero sin tercer puesto, 3 equipos generan 2 partidos", !noThird.error && noThird.data === 2, noThird.error?.message);
  }

  console.log("\n== Cruces manuales ==");
  {
    const s = await setup(cGold, tGold, 4);
    const [a, b, c, d] = s.entryIds;
    const ok = await bracket(cGold, s.stageId, { p_seeding: "manual", p_manual_slots: [a, d, b, c] });
    check("Cruces manuales válidos", !ok.error && ok.data === 3, ok.error?.message);
    const ms = await matchesOf(s.stageId);
    const r1 = ms.filter((m) => m.round_number === 1);
    check("Respeta exactamente quién juega contra quién (A-D y B-C)", r1[0].home_entry_id === a && r1[0].away_entry_id === d && r1[1].home_entry_id === b && r1[1].away_entry_id === c);

    check("Rechaza cruces manuales sin indicar posiciones", !!(await bracket(cGold, s.stageId, { p_seeding: "manual" })).error);
    check("Rechaza cantidad de posiciones incorrecta", !!(await bracket(cGold, s.stageId, { p_seeding: "manual", p_manual_slots: [a, b, c] })).error);
    check("Rechaza un equipo repetido", !!(await bracket(cGold, s.stageId, { p_seeding: "manual", p_manual_slots: [a, a, b, c] })).error);
    const other = await setup(cGold, tGold, 4);
    check("Rechaza un equipo que no pertenece al torneo", !!(await bracket(cGold, s.stageId, { p_seeding: "manual", p_manual_slots: [a, b, c, other.entryIds[0]] })).error);
    check("Rechaza dejar fuera a un equipo inscrito", !!(await bracket(cGold, s.stageId, { p_seeding: "manual", p_manual_slots: [a, b, c, null] })).error);

    const s6 = await setup(cGold, tGold, 6);
    const [e1, e2, e3, e4, e5, e6] = s6.entryIds;
    const byes = await bracket(cGold, s6.stageId, { p_seeding: "manual", p_manual_slots: [e1, null, e2, e3, e4, e5, null, e6] });
    check("Manual con lugares libres (byes elegidos por el admin)", !byes.error && byes.data === 5, byes.error?.message);
    const ms6 = await matchesOf(s6.stageId);
    const r2s = ms6.filter((m) => m.round_number === 2);
    check("e1 y e6 (frente a un lugar libre) quedan ubicados directo en la ronda 2", r2s.some((m) => m.home_entry_id === e1) && r2s.some((m) => m.away_entry_id === e6));
    const bothEmpty = await bracket(cGold, s6.stageId, { p_seeding: "manual", p_manual_slots: [e1, e2, e3, e4, null, null, e5, e6] });
    check("Rechaza un cruce sin ningún equipo (dos lugares libres juntos)", !!bothEmpty.error, bothEmpty.error?.message);
    check("Tras el error el calendario anterior sigue intacto (5 partidos)", (await matchesOf(s6.stageId)).length === 5);
  }

  console.log("\n== Fechas ==");
  {
    const s = await setup(cGold, tGold, 4, { third: true });
    await bracket(cGold, s.stageId, { p_first_date: "2026-10-03", p_days_between_rounds: 7, p_kickoff_time: "15:00" });
    const ms = await matchesOf(s.stageId);
    const iso = (m) => new Date(m.scheduled_at).toISOString();
    check("Ronda 1: 3-oct 15:00 Ecuador = 20:00 UTC", ms.filter((m) => m.round_number === 1).every((m) => iso(m) === "2026-10-03T20:00:00.000Z"));
    check("La final y el tercer puesto: 10-oct", ms.filter((m) => m.round_number === 2).every((m) => iso(m) === "2026-10-10T20:00:00.000Z"));
  }

  console.log("\n== Regenerar, equipos retirados y bloqueo ==");
  {
    const s = await setup(cGold, tGold, 8);
    await bracket(cGold, s.stageId);
    const oldIds = new Set((await matchesOf(s.stageId)).map((m) => m.id));
    const again = await bracket(cGold, s.stageId);
    const now = await matchesOf(s.stageId);
    check("Regenerar reemplaza toda la llave (7 partidos nuevos)", !again.error && now.length === 7 && now.every((m) => !oldIds.has(m.id)));

    await admin.from("tournament_entries").update({ status: "withdrawn" }).eq("id", s.entryIds[0]);
    const seven = await bracket(cGold, s.stageId);
    const ms7 = await matchesOf(s.stageId);
    check("Un equipo retirado no entra: 7 equipos = 6 partidos", !seven.error && ms7.length === 6 && leafCounts(ms7, s.entryIds).get(s.entryIds[0]) === 0);

    const [first] = await matchesOf(s.stageId);
    await admin.from("matches").update({ status: "in_progress" }).eq("id", first.id);
    check("Con un partido en curso NO se puede regenerar", !!(await bracket(cGold, s.stageId)).error);
    check("Con un partido en curso NO se puede borrar", !!(await cGold.rpc("clear_stage_fixture", { p_stage_id: s.stageId })).error);
    await admin.from("matches").update({ status: "scheduled" }).eq("id", first.id);
    const clear = await cGold.rpc("clear_stage_fixture", { p_stage_id: s.stageId });
    check("Con todo 'scheduled' se puede borrar la llave completa", !clear.error && (await matchesOf(s.stageId)).length === 0, clear.error?.message);

    const one = await setup(cGold, tGold, 1);
    check("Con 1 equipo se rechaza", !!(await bracket(cGold, one.stageId)).error);
  }

  console.log("\n== Formato y agenda ==");
  {
    const liga = await setup(cGold, tGold, 4, { format: "round_robin" });
    check("Una Liga NO admite generar llave", !!(await bracket(cGold, liga.stageId)).error);
    const cup = await setup(cGold, tGold, 4);
    const rr = await cGold.rpc("generate_round_robin_fixture", { p_stage_id: cup.stageId });
    check("Una Eliminatoria NO admite calendario de Liga", !!rr.error);
    await bracket(cGold, cup.stageId);
    const [m] = await matchesOf(cup.stageId);
    const sched = await cGold.rpc("set_match_schedule", { p_match_id: m.id, p_local_time: "2026-11-01T18:30:00", p_venue: "Estadio" });
    check("Se puede reprogramar un partido de la llave", !sched.error, sched.error?.message);
    const final = (await matchesOf(cup.stageId)).find((x) => x.round_number === 2);
    const schedFinal = await cGold.rpc("set_match_schedule", { p_match_id: final.id, p_local_time: "2026-11-08T18:30:00" });
    check("También la final, aunque sus equipos aún no estén definidos", !schedFinal.error, schedFinal.error?.message);
  }

  console.log("\n== Permisos, plan y solo lectura ==");
  {
    const s = await setup(cGold, tGold, 4);
    check("Visitante sin sesión NO puede", !!(await bracket(anonClient(), s.stageId)).error);
    check("Otro cliente NO puede generar la llave ajena", !!(await bracket(cSilver, s.stageId)).error);
    check("Un operador NO puede", !!(await bracket(cOp, s.stageId)).error);

    const bz = await setup(cBronze, tBronze, 4);
    const bzOk = await bracket(cBronze, bz.stageId);
    check("Bronce SÍ incluye la generación automática", !bzOk.error && bzOk.data === 3, bzOk.error?.message);

    await admin.from("plan_features").update({ enabled: false }).eq("plan_id", plans.bronze).eq("feature_key", "auto_fixtures");
    const off = await bracket(cBronze, bz.stageId);
    await admin.from("plan_features").update({ enabled: true }).eq("plan_id", plans.bronze).eq("feature_key", "auto_fixtures");
    check("Si el plan NO incluye la función, se rechaza", !!off.error && /no incluye/i.test(off.error.message), off.error?.message);

    const sv = await setup(cSilver, tSilver, 4);
    await admin.from("tenants").update({ subscription_status: "past_due", past_due_since: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString() }).eq("id", tSilver.id);
    const ro = await bracket(cSilver, sv.stageId);
    check("En solo lectura NO se puede generar", !!ro.error && /solo lectura/i.test(ro.error.message), ro.error?.message);
    await admin.from("tenants").update({ subscription_status: "active", past_due_since: null }).eq("id", tSilver.id);
  }

  console.log("\n== Escrituras directas y borrado de inscripciones ==");
  {
    const s = await setup(cGold, tGold, 4);
    await bracket(cGold, s.stageId);
    const ms = await matchesOf(s.stageId);
    const upd = await cGold.from("matches").update({ home_source_match_id: null }).eq("id", ms[2].id).select("id");
    check("NO se puede alterar la estructura de la llave por API", !!upd.error);
    const del = await cGold.from("matches").delete().eq("id", ms[0].id).select("id");
    check("NO se puede borrar un partido por API", !!del.error);
    const seenByOp = await cOp.from("matches").select("id").eq("stage_id", s.stageId);
    check("Un operador SÍ ve la llave", (seenByOp.data ?? []).length === 3);
    const seenByOther = await cSilver.from("matches").select("id").eq("stage_id", s.stageId);
    check("Otro cliente NO ve la llave ajena", (seenByOther.data ?? []).length === 0);
    const delEntry = await admin.from("tournament_entries").delete().eq("id", s.entryIds[0]);
    check("No se puede borrar una inscripción que ya está en la llave", !!delEntry.error);
    const bad = await admin.from("matches").update({ away_source_match_id: ms[0].id }).eq("id", ms[0].id);
    check("La base rechaza un lado con equipo Y origen a la vez o ninguno", !!bad.error);
  }
} catch (err) {
  console.error(`\nERROR: ${err.message}`);
  console.error(err.stack);
  results.push(false);
} finally {
  await admin.from("plan_features").update({ enabled: true }).eq("plan_id", plans.bronze ?? "00000000-0000-0000-0000-000000000000").eq("feature_key", "auto_fixtures");
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (tenantIds.length > 0) {
    const { error } = await admin.from("tenants").delete().in("id", tenantIds);
    if (error) console.error(`No se pudo limpiar del todo (revíselo a mano si persiste): ${error.message}`);
  }
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas.`);
process.exitCode = failed === 0 ? 0 : 1;
