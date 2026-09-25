// Prueba automática de la Fase 2.1 (motor paramétrico base) contra tu
// proyecto Supabase:
//   npm run test:tournaments
// Crea datos temporales (prefijo tetest-), los prueba con sesiones reales y
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
const sports = {};

async function loadCatalogs() {
  const { data: p, error: pe } = await admin.from("plans").select("id, code");
  if (pe) throw new Error(`No se pudieron leer los planes: ${pe.message}`);
  for (const row of p) plans[row.code] = row.id;
  for (const code of ["bronze", "silver", "gold"]) {
    if (!plans[code]) throw new Error(`Falta el plan "${code}". ¿Aplicaste las migraciones de la Fase 1?`);
  }

  const { data: s, error: se } = await admin.from("sports").select("id, code");
  if (se) throw new Error(`No se pudieron leer los deportes: ${se.message}`);
  for (const row of s) sports[row.code] = row.id;
  for (const code of ["futbol", "futbol_sala"]) {
    if (!sports[code]) throw new Error(`Falta el deporte "${code}". ¿Aplicaste la migración de la Fase 2.1?`);
  }
}

async function makeTenant(label, planCode) {
  const { data, error } = await admin
    .from("tenants")
    .insert({
      slug: `tetest-${label}-${suffix}`,
      name: `TE Test ${label.toUpperCase()}`,
      country: "EC",
      timezone: "America/Guayaquil",
      plan_id: plans[planCode],
    })
    .select("id, slug")
    .single();
  if (error) throw new Error(`No se pudo crear tenant de prueba: ${error.message}`);
  tenantIds.push(data.id);
  return data;
}

async function makeUser(label, role, tenantId) {
  const user = await createUserWithProfile(admin, {
    email: `tetest-${label}-${suffix}@example.com`,
    fullName: `TE ${label}`,
    role,
    tenantId,
  });
  userIds.push(user.id);
  return user;
}

async function signedInClient(user) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`No se pudo iniciar sesión como ${user.email}: ${error.message}`);
  return client;
}

async function makeTeam(client, tenantId, name) {
  const { data, error } = await client.from("teams").insert({ tenant_id: tenantId, name }).select("id").single();
  if (error) throw new Error(`No se pudo crear el equipo ${name}: ${error.message}`);
  return data.id;
}

async function createTournament(client, params) {
  return client.rpc("create_tournament", params);
}

try {
  await loadCatalogs();

  const tenantBronze = await makeTenant("bz", "bronze");
  const tenantSilver = await makeTenant("sv", "silver");
  const tenantGold = await makeTenant("gd", "gold");
  const adminBronze = await makeUser("admin-bz", "tenant_admin", tenantBronze.id);
  const adminSilver = await makeUser("admin-sv", "tenant_admin", tenantSilver.id);
  const adminGold = await makeUser("admin-gd", "tenant_admin", tenantGold.id);
  const root = await makeUser("root", "super_admin", null);

  const rootC = await signedInClient(root);
  const cBronze = await signedInClient(adminBronze);
  const cSilver = await signedInClient(adminSilver);
  const cGold = await signedInClient(adminGold);

  console.log("\n== Catálogo de deportes ==");
  {
    const anon = anonClient();
    const r = await anon.from("sports").select("id");
    check("Visitante sin sesión NO puede leer deportes", !!r.error || (r.data ?? []).length === 0);

    const asTenant = await cBronze.from("sports").select("code");
    check("Un cliente ve el catálogo de deportes", (asTenant.data ?? []).some((s) => s.code === "futbol"));

    const insertAsTenant = await cBronze.from("sports").insert({ code: `hack_${suffix}`, name: "Hack" });
    check("Un cliente NO puede crear deportes", !!insertAsTenant.error);

    const insertAsRoot = await rootC
      .from("sports")
      .insert({ code: `baloncesto_${suffix}`, name: "Baloncesto" })
      .select("id");
    check("El Super Admin SÍ puede crear deportes", !insertAsRoot.error && insertAsRoot.data?.length === 1, insertAsRoot.error?.message);
    if (insertAsRoot.data?.[0]) sports.baloncesto_test = insertAsRoot.data[0].id;

    const seenAfter = await cSilver.from("sports").select("code").eq("code", `baloncesto_${suffix}`);
    check("El deporte nuevo ya es visible para los clientes", (seenAfter.data ?? []).length === 1);
  }

  console.log("\n== Crear torneo: Liga (round_robin) ==");
  let ligaTournamentId;
  {
    const r = await createTournament(cGold, {
      p_tenant_id: tenantGold.id,
      p_sport_id: sports.futbol,
      p_name: "Liga de Prueba",
      p_format: "round_robin",
    });
    check("Se crea con los valores por defecto", !r.error && !!r.data, r.error?.message);
    ligaTournamentId = r.data;

    const stage = await admin.from("tournament_stages").select("*").eq("tournament_id", ligaTournamentId).single();
    check(
      "La fase creada es de Liga con puntuación 3/1/0 y 1 vuelta",
      stage.data?.format === "round_robin" &&
        stage.data?.win_points === 3 &&
        stage.data?.draw_points === 1 &&
        stage.data?.loss_points === 0 &&
        stage.data?.round_robin_legs === 1,
      JSON.stringify(stage.data),
    );
    check(
      "Trae los 5 desempates por defecto en orden",
      JSON.stringify(stage.data?.tie_breakers) ===
        JSON.stringify(["head_to_head", "goal_diff", "goals_for", "wins", "fewer_cards"]),
      JSON.stringify(stage.data?.tie_breakers),
    );
    check("Los parámetros de llave quedan vacíos (no aplican)", stage.data?.bracket_seeding === null && stage.data?.third_place_match === null);

    const group = await admin.from("tournament_groups").select("*").eq("stage_id", stage.data.id).single();
    check('Se crea automáticamente "Grupo Único"', group.data?.name === "Grupo Único");
  }

  console.log("\n== Crear torneo: Eliminatoria directa ==");
  {
    const r = await createTournament(cGold, {
      p_tenant_id: tenantGold.id,
      p_sport_id: sports.futbol,
      p_name: "Copa de Prueba",
      p_format: "single_elimination",
      p_bracket_seeding: "manual",
      p_third_place_match: true,
    });
    check("Se crea correctamente", !r.error && !!r.data, r.error?.message);

    const stage = await admin.from("tournament_stages").select("*").eq("tournament_id", r.data).single();
    check(
      "La fase queda como Eliminatoria, sin campos de Liga",
      stage.data?.format === "single_elimination" &&
        stage.data?.bracket_seeding === "manual" &&
        stage.data?.third_place_match === true &&
        stage.data?.win_points === null &&
        stage.data?.tie_breakers === null,
      JSON.stringify(stage.data),
    );

    const groups = await admin.from("tournament_groups").select("id").eq("stage_id", stage.data.id);
    check("Una llave NO tiene grupos", (groups.data ?? []).length === 0);
  }

  console.log("\n== Validaciones al crear torneos ==");
  {
    const badFormat = await createTournament(cGold, {
      p_tenant_id: tenantGold.id,
      p_sport_id: sports.futbol,
      p_name: "Formato inválido",
      p_format: "round_robin",
      p_round_robin_legs: 3,
    });
    check("Rechaza ida/vuelta fuera de 1 o 2", !!badFormat.error);

    const otherTenant = await createTournament(cGold, {
      p_tenant_id: tenantSilver.id,
      p_sport_id: sports.futbol,
      p_name: "Intruso",
      p_format: "round_robin",
    });
    check("NO se puede crear un torneo para otro cliente", !!otherTenant.error);

    const asOperator = await makeUser("op-gd", "operator", tenantGold.id);
    const cOp = await signedInClient(asOperator);
    const byOperator = await createTournament(cOp, {
      p_tenant_id: tenantGold.id,
      p_sport_id: sports.futbol,
      p_name: "Desde operador",
      p_format: "round_robin",
    });
    check("Un operador NO puede crear torneos", !!byOperator.error);
  }

  console.log("\n== Límite: tipos de deporte (Bronce = 1) ==");
  {
    const first = await createTournament(cBronze, {
      p_tenant_id: tenantBronze.id,
      p_sport_id: sports.futbol,
      p_name: "Torneo Fútbol",
      p_format: "round_robin",
    });
    check("El primer deporte entra sin problema", !first.error, first.error?.message);

    const secondSameSport = await createTournament(cBronze, {
      p_tenant_id: tenantBronze.id,
      p_sport_id: sports.futbol,
      p_name: "Otro Torneo de Fútbol",
      p_format: "round_robin",
    });
    check("Un segundo torneo del MISMO deporte no cuenta como nuevo tipo", !secondSameSport.error, secondSameSport.error?.message);

    const secondSport = await createTournament(cBronze, {
      p_tenant_id: tenantBronze.id,
      p_sport_id: sports.futbol_sala,
      p_name: "Torneo Futsal",
      p_format: "round_robin",
    });
    check("Un SEGUNDO tipo de deporte se rechaza en Bronce", !!secondSport.error, secondSport.error?.message);

    const stillOne = await admin.from("tournaments").update({ status: "finished" }).eq("id", first.data);
    check("(preparación) se finaliza el primer torneo de fútbol", !stillOne.error);
    const stillBlocked = await createTournament(cBronze, {
      p_tenant_id: tenantBronze.id,
      p_sport_id: sports.futbol_sala,
      p_name: "Futsal aún bloqueado",
      p_format: "round_robin",
    });
    check("Con OTRO torneo de fútbol aún sin finalizar, el segundo deporte sigue bloqueado", !!stillBlocked.error, stillBlocked.error?.message);

    const finish = await admin.from("tournaments").update({ status: "finished" }).eq("id", secondSameSport.data);
    check("(preparación) se finaliza también el segundo torneo de fútbol", !finish.error);

    const afterFinish = await createTournament(cBronze, {
      p_tenant_id: tenantBronze.id,
      p_sport_id: sports.futbol_sala,
      p_name: "Torneo Futsal 2",
      p_format: "round_robin",
    });
    check("Al finalizar el primero, el segundo deporte ya entra", !afterFinish.error, afterFinish.error?.message);
  }

  console.log("\n== Límite: torneos activos (Bronce = 1) ==");
  {
    // Se crean dos torneos de futsal en borrador: borrador NO cuenta como activo.
    const t1 = await createTournament(cBronze, { p_tenant_id: tenantBronze.id, p_sport_id: sports.futbol_sala, p_name: "Futsal A", p_format: "round_robin" });
    const t2 = await createTournament(cBronze, { p_tenant_id: tenantBronze.id, p_sport_id: sports.futbol_sala, p_name: "Futsal B", p_format: "round_robin" });
    check("Se pueden crear varios torneos en borrador sin gastar cupo de activos", !t1.error && !t2.error, t1.error?.message ?? t2.error?.message);
    const active0 = await admin.from("tournaments").select("id", { count: "exact", head: true }).eq("tenant_id", tenantBronze.id).in("status", ["scheduled", "in_progress"]);
    check("Ninguno está activo todavía", (active0.count ?? 0) === 0);
    const d1 = t1.data;
    const d2 = t2.data;

    const publish1 = await cBronze.from("tournaments").update({ status: "scheduled" }).eq("id", d1).select("id");
    check("Publicar el primer torneo (pasa a activo) funciona", publish1.data?.length === 1, JSON.stringify(publish1));

    const publish2 = await cBronze.from("tournaments").update({ status: "scheduled" }).eq("id", d2).select("id");
    check(
      "Publicar un SEGUNDO torneo activo se rechaza en Bronce (con mensaje claro)",
      !!publish2.error && /torneo\(s\) activo/.test(publish2.error.message),
      JSON.stringify(publish2),
    );

    const backToDraft = await cBronze.from("tournaments").update({ status: "draft" }).eq("id", d1).select("id");
    check("Se puede volver el primero a borrador", backToDraft.data?.length === 1);
    const publish2Again = await cBronze.from("tournaments").update({ status: "scheduled" }).eq("id", d2).select("id");
    check("Liberado el cupo, el segundo sí se puede publicar", publish2Again.data?.length === 1, JSON.stringify(publish2Again));
  }

  console.log("\n== Torneos privados (Plata sí, Bronce no) ==");
  {
    const bronzePrivate = await createTournament(cBronze, {
      p_tenant_id: tenantBronze.id,
      p_sport_id: sports.futbol,
      p_name: "Privado Bronce",
      p_format: "round_robin",
      p_is_public: false,
    });
    check("Bronce NO puede crear un torneo privado", !!bronzePrivate.error, bronzePrivate.error?.message);

    const silverPrivate = await createTournament(cSilver, {
      p_tenant_id: tenantSilver.id,
      p_sport_id: sports.futbol,
      p_name: "Privado Plata",
      p_format: "round_robin",
      p_is_public: false,
    });
    check("Plata SÍ puede crear un torneo privado", !silverPrivate.error, silverPrivate.error?.message);

    const makePublicAgain = await cBronze.from("tournaments").update({ is_public: true }).eq("id", ligaTournamentId).select("id");
    // ligaTournamentId es de Gold, no de Bronce: no debería tocar nada (RLS ajena), lo usamos solo para no fallar por otra razón.
    check("(sanidad) no se puede tocar un torneo ajeno", !makePublicAgain.error && makePublicAgain.data?.length === 0);
  }

  console.log("\n== Equipos y aislamiento ==");
  let teamA1, teamA2, teamA3, teamA4, teamA5, teamA6;
  {
    teamA1 = await makeTeam(cBronze, tenantBronze.id, `Equipo 1 ${suffix}`);
    teamA2 = await makeTeam(cBronze, tenantBronze.id, `Equipo 2 ${suffix}`);
    teamA3 = await makeTeam(cBronze, tenantBronze.id, `Equipo 3 ${suffix}`);
    teamA4 = await makeTeam(cBronze, tenantBronze.id, `Equipo 4 ${suffix}`);
    teamA5 = await makeTeam(cBronze, tenantBronze.id, `Equipo 5 ${suffix}`);
    check("Se crean 5 equipos en Bronce", true);

    const dup = await cBronze.from("teams").insert({ tenant_id: tenantBronze.id, name: `Equipo 1 ${suffix}` });
    check("NO se permite un nombre de equipo repetido", !!dup.error);

    const crossTenant = await cSilver.from("teams").select("id").eq("id", teamA1);
    check("Otro cliente NO ve el equipo ajeno", (crossTenant.data ?? []).length === 0);

    const insertForOther = await cBronze.from("teams").insert({ tenant_id: tenantSilver.id, name: `Intruso ${suffix}` });
    check("NO se puede crear un equipo para otro cliente", !!insertForOther.error);
  }

  console.log("\n== Límite: equipos por torneo (Bronce = 5) ==");
  let entryIds = [];
  {
    const { data: t } = await admin.from("tournaments").select("id").eq("tenant_id", tenantBronze.id).eq("status", "scheduled").limit(1).single();
    const bronzeTournamentId = t.id;

    for (const teamId of [teamA1, teamA2, teamA3, teamA4, teamA5]) {
      const r = await cBronze.from("tournament_entries").insert({ tournament_id: bronzeTournamentId, team_id: teamId, tenant_id: tenantBronze.id }).select("id");
      if (r.data?.[0]) entryIds.push(r.data[0].id);
    }
    check("Los primeros 5 equipos se inscriben sin problema", entryIds.length === 5);

    teamA6 = await makeTeam(cBronze, tenantBronze.id, `Equipo 6 ${suffix}`);
    const sixth = await cBronze.from("tournament_entries").insert({ tournament_id: bronzeTournamentId, team_id: teamA6, tenant_id: tenantBronze.id });
    check("El 6.º equipo se rechaza en Bronce", !!sixth.error, sixth.error?.message);

    const withdraw = await cBronze.from("tournament_entries").update({ status: "withdrawn" }).eq("id", entryIds[0]).select("id");
    check("Se puede retirar un equipo inscrito", withdraw.data?.length === 1);
    const sixthAfterWithdraw = await cBronze.from("tournament_entries").insert({ tournament_id: bronzeTournamentId, team_id: teamA6, tenant_id: tenantBronze.id }).select("id");
    check("Liberado el cupo, el 6.º equipo ya entra", !sixthAfterWithdraw.error, sixthAfterWithdraw.error?.message);
    if (sixthAfterWithdraw.data?.[0]) entryIds.push(sixthAfterWithdraw.data[0].id);

    const foreignTeamEntry = await cSilver.from("tournament_entries").insert({ tournament_id: bronzeTournamentId, team_id: teamA2, tenant_id: tenantSilver.id });
    check("Otro cliente NO puede inscribir en un torneo ajeno", !!foreignTeamEntry.error);
  }

  console.log("\n== Límite: jugadores por torneo (Bronce = 75, agregado) ==");
  {
    const targetEntry = entryIds[1];
    const names = Array.from({ length: 75 }, (_, i) => `Jugador ${i + 1} ${suffix}`);
    let inserted = 0;
    for (const full_name of names) {
      const r = await cBronze.from("roster_players").insert({ tournament_entry_id: targetEntry, tenant_id: tenantBronze.id, full_name });
      if (!r.error) inserted++;
    }
    check("Se registran los 75 jugadores permitidos", inserted === 75, `insertados: ${inserted}`);

    const extra = await cBronze.from("roster_players").insert({ tournament_entry_id: entryIds[2], tenant_id: tenantBronze.id, full_name: `Jugador 76 ${suffix}` });
    check("El jugador 76 (en OTRO equipo del mismo torneo) se rechaza: el límite es por torneo", !!extra.error, extra.error?.message);

    const { data: oneRow } = await cBronze.from("roster_players").select("id").eq("tournament_entry_id", targetEntry).limit(1).single();
    const deactivate = await cBronze.from("roster_players").update({ is_active: false }).eq("id", oneRow.id).select("id");
    check("Se puede dar de baja a un jugador", deactivate.data?.length === 1);
    const extraAfter = await cBronze.from("roster_players").insert({ tournament_entry_id: entryIds[2], tenant_id: tenantBronze.id, full_name: `Jugador 76b ${suffix}` });
    check("Liberado el cupo, entra otro jugador", !extraAfter.error, extraAfter.error?.message);
  }

  console.log("\n== Dorsales únicos por equipo ==");
  {
    const entry = entryIds[3];
    // El torneo quedó al tope de 75 jugadores en la prueba anterior: se dan de baja 5 para hacer sitio.
    const { data: toFree } = await admin.from("roster_players").select("id").eq("tournament_entry_id", entryIds[1]).eq("is_active", true).limit(5);
    await admin.from("roster_players").update({ is_active: false }).in("id", toFree.map((p) => p.id));
    const p1 = await cBronze.from("roster_players").insert({ tournament_entry_id: entry, tenant_id: tenantBronze.id, full_name: `Arquero ${suffix}`, jersey_number: 1 }).select("id");
    check("Se registra el dorsal 1", !p1.error, p1.error?.message);
    const p1dup = await cBronze.from("roster_players").insert({ tournament_entry_id: entry, tenant_id: tenantBronze.id, full_name: `Otro ${suffix}`, jersey_number: 1 });
    check("El mismo dorsal 1 en el mismo equipo se rechaza", !!p1dup.error);
    if (p1.data?.[0]) {
      await cBronze.from("roster_players").update({ is_active: false }).eq("id", p1.data[0].id);
      const p1reuse = await cBronze.from("roster_players").insert({ tournament_entry_id: entry, tenant_id: tenantBronze.id, full_name: `Reemplazo ${suffix}`, jersey_number: 1 });
      check("Dado de baja el dorsal 1, se puede reasignar", !p1reuse.error, p1reuse.error?.message);
    }
  }

  console.log("\n== Add-on \"Servicio de estadísticas\" (solo Oro, solo Super Admin) ==");
  {
    const { data: statsAddon } = await admin.from("addons").select("id").eq("code", "stats_service").single();
    const bySelf = await cGold.from("tournament_addons").insert({ tournament_id: ligaTournamentId, addon_id: statsAddon.id });
    check("El cliente NO puede activarse el add-on solo", !!bySelf.error);

    const onGoldByRoot = await rootC.from("tournament_addons").insert({ tournament_id: ligaTournamentId, addon_id: statsAddon.id }).select("id");
    check("El Super Admin lo activa en un torneo Oro", !onGoldByRoot.error, onGoldByRoot.error?.message);

    const { data: bronzeDraft } = await admin.from("tournaments").select("id").eq("tenant_id", tenantBronze.id).limit(1).single();
    const onBronzeByRoot = await rootC.from("tournament_addons").insert({ tournament_id: bronzeDraft.id, addon_id: statsAddon.id });
    check("El Super Admin NO puede activarlo en un torneo Bronce (el plan no lo habilita)", !!onBronzeByRoot.error, onBronzeByRoot.error?.message);

    const visibleToClient = await cGold.from("tournament_addons").select("id").eq("tournament_id", ligaTournamentId);
    check("El cliente Oro VE que el add-on está activo (solo lectura)", (visibleToClient.data ?? []).length === 1);
  }

  console.log("\n== tournament_overview ==");
  {
    const { data: t } = await admin.from("tournaments").select("id").eq("tenant_id", tenantBronze.id).eq("status", "scheduled").limit(1).single();
    const ov = await cBronze.from("tournament_overview").select("*").eq("id", t.id).single();
    check("Trae deporte, formato y conteo de equipos/jugadores", ov.data?.sport_code && ov.data?.format === "round_robin" && typeof ov.data?.teams_count === "number");
  }

  console.log("\n== Solo lectura (mora vencida) bloquea escrituras ==");
  {
    await admin.from("tenants").update({ subscription_status: "past_due", past_due_since: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString() }).eq("id", tenantSilver.id);
    const roTeam = await cSilver.from("teams").insert({ tenant_id: tenantSilver.id, name: `RO ${suffix}` });
    check("En solo lectura NO se pueden crear equipos", !!roTeam.error);
    const roTournament = await createTournament(cSilver, {
      p_tenant_id: tenantSilver.id,
      p_sport_id: sports.futbol,
      p_name: "RO torneo",
      p_format: "round_robin",
    });
    check("En solo lectura NO se pueden crear torneos", !!roTournament.error, roTournament.error?.message);
    const roRead = await cSilver.from("tournaments").select("id");
    check("En solo lectura SÍ se puede seguir leyendo", (roRead.data?.length ?? 0) > 0);
    await admin.from("tenants").update({ subscription_status: "active", past_due_since: null }).eq("id", tenantSilver.id);
  }
} catch (err) {
  console.error(`\nERROR: ${err.message}`);
  console.error(err.stack);
  results.push(false);
} finally {
  if (sports.baloncesto_test) await admin.from("sports").delete().eq("id", sports.baloncesto_test); // deporte de prueba
  for (const id of userIds) await admin.auth.admin.deleteUser(id); // borra también el perfil
  if (tenantIds.length > 0) {
    const { error } = await admin.from("tenants").delete().in("id", tenantIds);
    if (error) console.error(`No se pudo limpiar del todo (revíselo a mano si persiste): ${error.message}`);
  }
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas.`);
process.exitCode = failed === 0 ? 0 : 1;
