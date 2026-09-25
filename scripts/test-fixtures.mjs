// Prueba automática de la Fase 2.2 (calendarios de Liga) contra tu proyecto
// Supabase:
//   npm run test:fixtures
// Crea datos temporales (prefijo fxtest-), los prueba con sesiones reales y
// los borra al terminar. No toca tus datos reales.
import { randomBytes } from "node:crypto";
import { adminClient, anonClient, createUserWithProfile } from "./lib.mjs";

const admin = adminClient();
const suffix = randomBytes(3).toString("hex");
const userIds = [];
const tenantIds = [];
const results = [];
let disabledFeaturePlanId = null;

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
      slug: `fxtest-${label}-${suffix}`,
      name: `FX Test ${label.toUpperCase()}`,
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
    email: `fxtest-${label}-${suffix}@example.com`,
    fullName: `FX ${label}`,
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

/** Crea torneo + n equipos inscritos. Devuelve ids. */
async function setup(client, tenant, n, { format = "round_robin", legs = 1, name = "Torneo" } = {}) {
  const { data: tournamentId, error } = await client.rpc("create_tournament", {
    p_tenant_id: tenant.id,
    p_sport_id: futbolId,
    p_name: `${name} ${randomBytes(2).toString("hex")}`,
    p_format: format,
    p_round_robin_legs: legs,
  });
  if (error) throw new Error(`No se pudo crear el torneo: ${error.message}`);
  const { data: stage } = await admin.from("tournament_stages").select("id").eq("tournament_id", tournamentId).single();
  const entryIds = [];
  for (let i = 1; i <= n; i++) {
    const { data: team } = await admin
      .from("teams")
      .insert({ tenant_id: tenant.id, name: `Eq ${randomBytes(3).toString("hex")} ${i}` })
      .select("id")
      .single();
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
  const { data } = await admin
    .from("matches")
    .select("*")
    .eq("stage_id", stageId)
    .order("round_number")
    .order("slot");
  return data ?? [];
}

const generate = (client, stageId, extra = {}) =>
  client.rpc("generate_round_robin_fixture", { p_stage_id: stageId, ...extra });

function roundsOf(matches) {
  const map = new Map();
  for (const m of matches) {
    if (!map.has(m.round_number)) map.set(m.round_number, []);
    map.get(m.round_number).push(m);
  }
  return map;
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

  console.log("\n== 4 equipos, una vuelta ==");
  {
    const s = await setup(cGold, tGold, 4);
    const r = await generate(cGold, s.stageId, { p_shuffle: false });
    check("Devuelve 6 partidos", !r.error && r.data === 6, r.error?.message ?? String(r.data));
    const ms = await matchesOf(s.stageId);
    const rounds = roundsOf(ms);
    check("Hay 3 jornadas de 2 partidos", rounds.size === 3 && [...rounds.values()].every((x) => x.length === 2));
    const eachOncePerRound = [...rounds.values()].every((round) => {
      const teams = round.flatMap((m) => [m.home_entry_id, m.away_entry_id]);
      return new Set(teams).size === 4;
    });
    check("En cada jornada todos los equipos juegan exactamente una vez", eachOncePerRound);
    const pairs = new Set(ms.map((m) => [m.home_entry_id, m.away_entry_id].sort().join("|")));
    check("Cada pareja se enfrenta exactamente una vez (6 parejas distintas)", pairs.size === 6);
    check("Sin fecha: scheduled_at queda vacío", ms.every((m) => m.scheduled_at === null));
    check("Todos los partidos nacen 'scheduled'", ms.every((m) => m.status === "scheduled"));
  }

  console.log("\n== 5 equipos (impar): descanso automático ==");
  {
    const s = await setup(cGold, tGold, 5);
    const r = await generate(cGold, s.stageId);
    check("Devuelve 10 partidos", !r.error && r.data === 10, r.error?.message);
    const ms = await matchesOf(s.stageId);
    const rounds = roundsOf(ms);
    check("Hay 5 jornadas de 2 partidos (uno descansa por jornada)", rounds.size === 5 && [...rounds.values()].every((x) => x.length === 2));
    const rests = new Map(s.entryIds.map((id) => [id, 0]));
    for (const round of rounds.values()) {
      const playing = new Set(round.flatMap((m) => [m.home_entry_id, m.away_entry_id]));
      for (const id of s.entryIds) if (!playing.has(id)) rests.set(id, rests.get(id) + 1);
    }
    check("Cada equipo descansa exactamente una jornada", [...rests.values()].every((v) => v === 1), JSON.stringify([...rests.values()]));
    const pairs = new Set(ms.map((m) => [m.home_entry_id, m.away_entry_id].sort().join("|")));
    check("Cada pareja se enfrenta una sola vez (10 parejas)", pairs.size === 10);
  }

  console.log("\n== 4 equipos, ida y vuelta ==");
  {
    const s = await setup(cGold, tGold, 4, { legs: 2 });
    const r = await generate(cGold, s.stageId);
    check("Devuelve 12 partidos", !r.error && r.data === 12, r.error?.message);
    const ms = await matchesOf(s.stageId);
    check("Hay 6 jornadas", roundsOf(ms).size === 6);
    check("La vuelta ocupa las jornadas 4 a 6", ms.filter((m) => m.leg === 2).every((m) => m.round_number >= 4) && ms.filter((m) => m.leg === 1).every((m) => m.round_number <= 3));
    const ordered = new Set(ms.map((m) => `${m.home_entry_id}>${m.away_entry_id}`));
    check("Cada cruce ordenado (local>visita) aparece una sola vez: 12 distintos", ordered.size === 12);
    const leg1 = ms.filter((m) => m.leg === 1);
    const leg2 = new Set(ms.filter((m) => m.leg === 2).map((m) => `${m.home_entry_id}>${m.away_entry_id}`));
    check("En la vuelta se invierte la localía de cada cruce", leg1.every((m) => leg2.has(`${m.away_entry_id}>${m.home_entry_id}`)));
  }

  console.log("\n== Localías repartidas ==");
  {
    const balance = async (n) => {
      const s = await setup(cGold, tGold, n);
      await generate(cGold, s.stageId);
      const ms = await matchesOf(s.stageId);
      const diffs = s.entryIds.map((id) => {
        const home = ms.filter((m) => m.home_entry_id === id).length;
        const away = ms.filter((m) => m.away_entry_id === id).length;
        return Math.abs(home - away);
      });
      return { ms, max: Math.max(...diffs), diffs };
    };
    const six = await balance(6);
    check("6 equipos: 15 partidos", six.ms.length === 15);
    check("6 equipos: ninguno se desbalancea más de 1 (óptimo posible)", six.max <= 1, JSON.stringify(six.diffs));
    const eight = await balance(8);
    check("8 equipos: 28 partidos y desbalance máximo 1", eight.ms.length === 28 && eight.max <= 1, JSON.stringify(eight.diffs));
    const five = await balance(5);
    check("5 equipos (impar): desbalance máximo 2", five.max <= 2, JSON.stringify(five.diffs));
    const seven = await balance(7);
    check("7 equipos (impar): 21 partidos y desbalance máximo 2", seven.ms.length === 21 && seven.max <= 2, JSON.stringify(seven.diffs));
  }

  console.log("\n== Fechas en la zona horaria del cliente ==");
  {
    const s = await setup(cGold, tGold, 4);
    const r = await generate(cGold, s.stageId, { p_first_date: "2026-10-03", p_days_between_rounds: 7, p_kickoff_time: "15:00" });
    check("Genera con fechas", !r.error, r.error?.message);
    const ms = await matchesOf(s.stageId);
    const byRound = roundsOf(ms);
    const at = (round) => new Date(byRound.get(round)[0].scheduled_at).toISOString();
    check("Jornada 1: 3-oct 15:00 (Ecuador) = 20:00 UTC", at(1) === "2026-10-03T20:00:00.000Z", at(1));
    check("Jornada 2: 7 días después", at(2) === "2026-10-10T20:00:00.000Z", at(2));
    check("Jornada 3: 14 días después", at(3) === "2026-10-17T20:00:00.000Z", at(3));

    const r2 = await generate(cGold, s.stageId, { p_first_date: "2026-10-03", p_days_between_rounds: 3, p_kickoff_time: "18:30" });
    const ms2 = await matchesOf(s.stageId);
    const j2 = new Date(roundsOf(ms2).get(2)[0].scheduled_at).toISOString();
    check("Cada 3 días a las 18:30 → jornada 2 = 6-oct 23:30 UTC", !r2.error && j2 === "2026-10-06T23:30:00.000Z", j2);

    const bad = await generate(cGold, s.stageId, { p_first_date: "2026-10-03", p_days_between_rounds: 0 });
    check("Rechaza 0 días entre jornadas", !!bad.error);
  }

  console.log("\n== Regenerar y equipos retirados ==");
  {
    const s = await setup(cGold, tGold, 4);
    await generate(cGold, s.stageId);
    const oldIds = new Set((await matchesOf(s.stageId)).map((m) => m.id));
    const again = await generate(cGold, s.stageId);
    const newMs = await matchesOf(s.stageId);
    check("Regenerar reemplaza el calendario (mismos 6 partidos, ids nuevos)", !again.error && newMs.length === 6 && newMs.every((m) => !oldIds.has(m.id)));

    await admin.from("tournament_entries").update({ status: "withdrawn" }).eq("id", s.entryIds[0]);
    const three = await generate(cGold, s.stageId);
    const ms3 = await matchesOf(s.stageId);
    check("Un equipo retirado no entra al nuevo calendario (3 equipos = 3 partidos)", !three.error && ms3.length === 3 && ms3.every((m) => m.home_entry_id !== s.entryIds[0] && m.away_entry_id !== s.entryIds[0]));

    await admin.from("tournament_entries").update({ status: "withdrawn" }).eq("id", s.entryIds[1]);
    const two = await generate(cGold, s.stageId);
    check("Con 2 equipos sale 1 partido", !two.error && two.data === 1);

    await admin.from("tournament_entries").update({ status: "withdrawn" }).eq("id", s.entryIds[2]);
    const one = await generate(cGold, s.stageId);
    check("Con 1 equipo se rechaza (mínimo 2)", !!one.error, one.error?.message);
  }

  console.log("\n== Bloqueo cuando ya hay partidos iniciados ==");
  {
    const s = await setup(cGold, tGold, 4);
    await generate(cGold, s.stageId);
    const [first] = await matchesOf(s.stageId);
    await admin.from("matches").update({ status: "in_progress" }).eq("id", first.id);
    const regen = await generate(cGold, s.stageId);
    check("NO se puede regenerar con un partido en curso", !!regen.error && /no se puede modificar/i.test(regen.error.message), regen.error?.message);
    const clear = await cGold.rpc("clear_stage_fixture", { p_stage_id: s.stageId });
    check("NO se puede borrar el calendario con un partido en curso", !!clear.error);
    const resched = await cGold.rpc("set_match_schedule", { p_match_id: first.id, p_local_time: "2026-11-01T10:00:00" });
    check("NO se puede reprogramar un partido en curso", !!resched.error);
    check("El calendario quedó intacto (6 partidos)", (await matchesOf(s.stageId)).length === 6);

    await admin.from("matches").update({ status: "scheduled" }).eq("id", first.id);
    const clear2 = await cGold.rpc("clear_stage_fixture", { p_stage_id: s.stageId });
    check("Con todo 'scheduled' sí se puede borrar", !clear2.error && (await matchesOf(s.stageId)).length === 0, clear2.error?.message);
  }

  console.log("\n== Reprogramar partidos ==");
  {
    const s = await setup(cGold, tGold, 4);
    await generate(cGold, s.stageId);
    const [m] = await matchesOf(s.stageId);
    const ok = await cGold.rpc("set_match_schedule", { p_match_id: m.id, p_local_time: "2026-11-01T18:30:00", p_venue: "  Cancha 2  " });
    check("El admin fija fecha y sede", !ok.error, ok.error?.message);
    const { data: after } = await admin.from("matches").select("scheduled_at, venue").eq("id", m.id).single();
    check("18:30 Ecuador = 23:30 UTC y la sede se guarda sin espacios", new Date(after.scheduled_at).toISOString() === "2026-11-01T23:30:00.000Z" && after.venue === "Cancha 2", JSON.stringify(after));
    const clearDate = await cGold.rpc("set_match_schedule", { p_match_id: m.id, p_local_time: null, p_venue: null });
    const { data: cleared } = await admin.from("matches").select("scheduled_at, venue").eq("id", m.id).single();
    check("Se puede dejar sin fecha ni sede", !clearDate.error && cleared.scheduled_at === null && cleared.venue === null);
    const other = await cSilver.rpc("set_match_schedule", { p_match_id: m.id, p_local_time: "2026-11-01T10:00:00" });
    check("Otro cliente NO puede reprogramar partidos ajenos", !!other.error);
  }

  console.log("\n== Formato y estado del torneo ==");
  {
    const bracket = await setup(cGold, tGold, 4, { format: "single_elimination", name: "Copa" });
    const r = await generate(cGold, bracket.stageId);
    check("Una Eliminatoria NO admite calendario de Liga", !!r.error, r.error?.message);

    const s = await setup(cGold, tGold, 4);
    await admin.from("tournaments").update({ status: "finished" }).eq("id", s.tournamentId);
    const fin = await generate(cGold, s.stageId);
    check("Un torneo finalizado no admite calendario", !!fin.error, fin.error?.message);
  }

  console.log("\n== Permisos, plan y solo lectura ==");
  {
    const s = await setup(cGold, tGold, 4);
    const anon = await generate(anonClient(), s.stageId);
    check("Un visitante sin sesión NO puede generar", !!anon.error);
    const other = await generate(cSilver, s.stageId);
    check("Otro cliente NO puede generar el calendario ajeno", !!other.error, other.error?.message);
    const op = await generate(cOp, s.stageId);
    check("Un operador NO puede generar calendarios", !!op.error);

    const bz = await setup(cBronze, tBronze, 4);
    const bzOk = await generate(cBronze, bz.stageId);
    check("Bronce SÍ incluye calendarios automáticos", !bzOk.error && bzOk.data === 6, bzOk.error?.message);

    disabledFeaturePlanId = plans.bronze;
    await admin.from("plan_features").update({ enabled: false }).eq("plan_id", plans.bronze).eq("feature_key", "auto_fixtures");
    const noFeature = await generate(cBronze, bz.stageId);
    check("Si el plan NO incluye la función, se rechaza aunque sea su torneo", !!noFeature.error && /no incluye/i.test(noFeature.error.message), noFeature.error?.message);
    await admin.from("plan_features").update({ enabled: true }).eq("plan_id", plans.bronze).eq("feature_key", "auto_fixtures");
    disabledFeaturePlanId = null;

    await admin.from("tenants").update({ subscription_status: "past_due", past_due_since: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString() }).eq("id", tSilver.id);
    const ss = await setup(cGold, tGold, 3); // torneo del cliente Oro; el de Plata se crea con service role abajo
    const roS = await setup(cSilver, tSilver, 3).catch((e) => ({ error: e }));
    check("En solo lectura no se pueden crear torneos (ni por tanto calendarios)", !!roS.error);
    await admin.from("tenants").update({ subscription_status: "active", past_due_since: null }).eq("id", tSilver.id);
    const silverS = await setup(cSilver, tSilver, 3);
    await admin.from("tenants").update({ subscription_status: "past_due", past_due_since: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString() }).eq("id", tSilver.id);
    const roGen = await generate(cSilver, silverS.stageId);
    check("En solo lectura NO se puede generar un calendario existente", !!roGen.error && /solo lectura/i.test(roGen.error.message), roGen.error?.message);
    await admin.from("tenants").update({ subscription_status: "active", past_due_since: null }).eq("id", tSilver.id);
    void ss;
  }

  console.log("\n== Los clientes no escriben partidos directamente (RLS) ==");
  {
    const s = await setup(cGold, tGold, 4);
    await generate(cGold, s.stageId);
    const [m] = await matchesOf(s.stageId);
    const ins = await cGold.from("matches").insert({ tenant_id: tGold.id, tournament_id: s.tournamentId, stage_id: s.stageId, round_number: 9, home_entry_id: s.entryIds[0], away_entry_id: s.entryIds[1] });
    check("NO puede insertar partidos", !!ins.error);
    const upd = await cGold.from("matches").update({ status: "finished" }).eq("id", m.id).select("id");
    check("NO puede cambiar el estado de un partido por API", !!upd.error);
    const del = await cGold.from("matches").delete().eq("id", m.id).select("id");
    check("NO puede borrar partidos por API", !!del.error);
    const seenByOp = await cOp.from("matches").select("id").eq("stage_id", s.stageId);
    check("Un operador SÍ puede ver el calendario de su cliente", (seenByOp.data ?? []).length === 6);
    const seenByOther = await cSilver.from("matches").select("id").eq("stage_id", s.stageId);
    check("Otro cliente NO ve el calendario ajeno", (seenByOther.data ?? []).length === 0);
    const delEntry = await admin.from("tournament_entries").delete().eq("id", s.entryIds[0]);
    check("No se puede borrar una inscripción que ya tiene partidos", !!delEntry.error);
  }
} catch (err) {
  console.error(`\nERROR: ${err.message}`);
  console.error(err.stack);
  results.push(false);
} finally {
  if (disabledFeaturePlanId) {
    await admin.from("plan_features").update({ enabled: true }).eq("plan_id", disabledFeaturePlanId).eq("feature_key", "auto_fixtures");
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (tenantIds.length > 0) {
    const { error } = await admin.from("tenants").delete().in("id", tenantIds);
    if (error) console.error(`No se pudo limpiar del todo (revíselo a mano si persiste): ${error.message}`);
  }
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas.`);
process.exitCode = failed === 0 ? 0 : 1;
