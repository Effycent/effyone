// Prueba automática de aislamiento, planes y reglas de suscripción contra tu
// proyecto Supabase:
//   npm run test:rls
// Crea datos temporales (prefijo rlstest-), los prueba con sesiones reales y
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

async function loadPlans() {
  const { data, error } = await admin.from("plans").select("id, code");
  if (error) throw new Error(`No se pudieron leer los planes: ${error.message}`);
  for (const p of data) plans[p.code] = p.id;
  for (const code of ["bronze", "silver", "gold"]) {
    if (!plans[code]) throw new Error(`Falta el plan "${code}". ¿Aplicaste la migración 1B?`);
  }
}

async function makeTenant(label, planCode) {
  const { data, error } = await admin
    .from("tenants")
    .insert({
      slug: `rlstest-${label}-${suffix}`,
      name: `RLS Test ${label.toUpperCase()}`,
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
    email: `rlstest-${label}-${suffix}@example.com`,
    fullName: `RLS ${label}`,
    role,
    tenantId,
  });
  userIds.push(user.id);
  return user;
}

async function tryMakeUser(label, role, tenantId) {
  try {
    return { ok: true, user: await makeUser(label, role, tenantId) };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function signedInClient(user) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`No se pudo iniciar sesión como ${user.email}: ${error.message}`);
  return client;
}

const ids = (rows) => (rows ?? []).map((r) => r.id).sort();
const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

async function overview(client, tenantId) {
  const { data } = await client.from("tenant_overview").select("*").eq("id", tenantId).maybeSingle();
  return data;
}

try {
  await loadPlans();

  // A = Oro (con operador) · B = Bronce · S = Plata
  const tenantA = await makeTenant("a", "gold");
  const tenantB = await makeTenant("b", "bronze");
  const tenantS = await makeTenant("s", "silver");
  const adminA = await makeUser("admin-a", "tenant_admin", tenantA.id);
  const opA = await makeUser("op-a", "operator", tenantA.id);
  const adminB = await makeUser("admin-b", "tenant_admin", tenantB.id);
  const adminS = await makeUser("admin-s", "tenant_admin", tenantS.id);
  const root = await makeUser("root", "super_admin", null);

  const rootC = await signedInClient(root);

  // ---------------------------------------------------------------- 1A
  console.log("\n== Visitante sin sesión ==");
  {
    const anon = anonClient();
    for (const table of ["tenants", "profiles", "plans", "plan_features", "feature_catalog", "addons", "platform_settings"]) {
      const r = await anon.from(table).select("*").limit(1);
      check(`No puede leer ${table}`, !!r.error || (r.data ?? []).length === 0);
    }
    const v = await anon.from("tenant_overview").select("id");
    check("No puede leer tenant_overview", !!v.error || (v.data ?? []).length === 0);
    const f = await anon.rpc("tenant_has_feature", { p_tenant_id: tenantA.id, p_feature_key: "auto_fixtures" });
    check("No puede consultar funciones de un tenant", !!f.error || f.data === false);
  }

  console.log("\n== Administrador del tenant A ==");
  {
    const c = await signedInClient(adminA);
    const t = await c.from("tenants").select("id, slug");
    check("Ve únicamente su tenant", t.data?.length === 1 && t.data[0].id === tenantA.id, JSON.stringify(t));
    const p = await c.from("profiles").select("id");
    check(
      "Ve únicamente a los usuarios de su tenant",
      JSON.stringify(ids(p.data)) === JSON.stringify([adminA.id, opA.id].sort()),
      JSON.stringify(p.data),
    );
    const own = await c.from("tenants").update({ name: "Nombre editado" }).eq("id", tenantA.id).select("id");
    check("Puede editar el nombre de su tenant", own.data?.length === 1, JSON.stringify(own));
    const slug = await c.from("tenants").update({ slug: `hack-${suffix}` }).eq("id", tenantA.id).select("id");
    check("NO puede cambiar el slug", !!slug.error, JSON.stringify(slug));
    const other = await c.from("tenants").update({ name: "Hackeado" }).eq("id", tenantB.id).select("id");
    check("NO puede editar el tenant B", !other.error && other.data?.length === 0, JSON.stringify(other));
    const ins = await c.from("tenants").insert({ slug: `x-${suffix}`, name: "Intruso", country: "EC", timezone: "UTC" });
    check("NO puede crear tenants", !!ins.error);
    const role = await c.from("profiles").update({ role: "super_admin" }).eq("id", adminA.id).select("id");
    check("NO puede escalar su propio rol", !!role.error, JSON.stringify(role));
    const insP = await c.from("profiles").insert({ id: adminB.id, tenant_id: tenantA.id, role: "operator", full_name: "Intruso" });
    check("NO puede insertar perfiles", !!insP.error);
  }

  console.log("\n== Operador del tenant A ==");
  {
    const c = await signedInClient(opA);
    const t = await c.from("tenants").select("id");
    check("Ve únicamente su tenant", t.data?.length === 1 && t.data[0].id === tenantA.id);
    const p = await c.from("profiles").select("id");
    check("Ve únicamente su propio perfil", JSON.stringify(ids(p.data)) === JSON.stringify([opA.id]), JSON.stringify(p.data));
    const upd = await c.from("tenants").update({ name: "Operador hack" }).eq("id", tenantA.id).select("id");
    check("NO puede editar su tenant", !upd.error && upd.data?.length === 0, JSON.stringify(upd));
  }

  console.log("\n== Administrador del tenant B ==");
  {
    const c = await signedInClient(adminB);
    const t = await c.from("tenants").select("id");
    check("Ve únicamente su tenant", t.data?.length === 1 && t.data[0].id === tenantB.id);
    const p = await c.from("profiles").select("id");
    check("Ve únicamente su perfil (no el de A)", JSON.stringify(ids(p.data)) === JSON.stringify([adminB.id]), JSON.stringify(p.data));
  }

  console.log("\n== Super Admin ==");
  {
    const t = await rootC.from("tenants").select("id").in("id", [tenantA.id, tenantB.id]);
    check("Ve los tenants A y B", t.data?.length === 2);
    const p = await rootC.from("profiles").select("id").in("id", [adminA.id, opA.id, adminB.id, root.id]);
    check("Ve los perfiles de todos", p.data?.length === 4);
  }

  console.log("\n== Usuario desactivado (sesión ya abierta) ==");
  {
    const c = await signedInClient(opA);
    const before = await c.from("tenants").select("id");
    check("Antes de desactivar: ve su tenant", before.data?.length === 1);
    const { error } = await admin.from("profiles").update({ is_active: false }).eq("id", opA.id);
    if (error) throw new Error(error.message);
    const after = await c.from("tenants").select("id");
    check("Tras desactivar: pierde acceso de inmediato", !after.error && after.data?.length === 0, JSON.stringify(after));
  }

  // ---------------------------------------------------------------- 1B
  console.log("\n== Planes y funciones: lectura y escritura ==");
  {
    const c = await signedInClient(adminA);
    const pl = await c.from("plans").select("code");
    check("El cliente ve los 3 planes activos", ["bronze", "silver", "gold"].every((k) => pl.data?.some((p) => p.code === k)), JSON.stringify(pl.data));
    const pf = await c.from("plan_features").select("feature_key").eq("plan_id", plans.gold);
    check("El cliente ve la matriz de funciones", (pf.data?.length ?? 0) > 0);
    const insPlan = await c.from("plans").insert({ code: `hack_${suffix}`, name: "Hack" });
    check("NO puede crear planes", !!insPlan.error);
    const updPlan = await c.from("plans").update({ price_cents: 1 }).eq("id", plans.gold).select("id");
    check("NO puede cambiar precios", !updPlan.error && updPlan.data?.length === 0, JSON.stringify(updPlan));
    const updFeat = await c
      .from("plan_features")
      .update({ enabled: true })
      .eq("plan_id", plans.bronze)
      .eq("feature_key", "read_api")
      .select("feature_key");
    check("NO puede activarse funciones", !updFeat.error && updFeat.data?.length === 0, JSON.stringify(updFeat));
    const planCol = await c.from("tenants").update({ plan_id: plans.gold }).eq("id", tenantA.id).select("id");
    check("NO puede cambiar su propio plan", !!planCol.error, JSON.stringify(planCol));
    const statusCol = await c.from("tenants").update({ subscription_status: "active" }).eq("id", tenantA.id).select("id");
    check("NO puede cambiar su estado de suscripción", !!statusCol.error, JSON.stringify(statusCol));
    const rpc1 = await c.rpc("admin_set_tenant_plan", { p_tenant_id: tenantA.id, p_plan_id: plans.gold });
    check("NO puede usar admin_set_tenant_plan", !!rpc1.error);
    const rpc2 = await c.rpc("admin_set_subscription_status", { p_tenant_id: tenantA.id, p_status: "suspended" });
    check("NO puede usar admin_set_subscription_status", !!rpc2.error);
    const set = await c.from("platform_settings").update({ grace_days: 30 }).eq("id", true).select("id");
    check("NO puede cambiar ajustes globales", !set.error && set.data?.length === 0, JSON.stringify(set));
  }

  console.log("\n== tenant_has_feature / tenant_feature_limit / tenant_entitlements ==");
  {
    const cA = await signedInClient(adminA);
    const cB = await signedInClient(adminB);
    const has = async (c, tenant, key) => (await c.rpc("tenant_has_feature", { p_tenant_id: tenant, p_feature_key: key })).data;
    const lim = async (c, tenant, key) => (await c.rpc("tenant_feature_limit", { p_tenant_id: tenant, p_feature_key: key })).data;

    check("Oro: incluye panel público", (await has(cA, tenantA.id, "public_panel")) === true);
    check("Oro: incluye respaldo en Sheets", (await has(cA, tenantA.id, "sheets_backup")) === true);
    check("Bronce: NO incluye panel público", (await has(cB, tenantB.id, "public_panel")) === false);
    check("Bronce: incluye calendarios automáticos", (await has(cB, tenantB.id, "auto_fixtures")) === true);
    check("Un cliente NO puede preguntar por otro tenant", (await has(cA, tenantB.id, "auto_fixtures")) === false);
    check("El Super Admin puede preguntar por cualquiera", (await has(rootC, tenantB.id, "auto_fixtures")) === true);
    check("Función inexistente = false", (await has(cA, tenantA.id, "no_existe")) === false);

    check("Bronce: máximo 5 equipos por torneo", (await lim(cB, tenantB.id, "max_teams_per_tournament")) === 5);
    check("Oro: administradores ilimitados (NULL)", (await lim(cA, tenantA.id, "max_admins")) === null);
    check("Consultar el límite de otro tenant devuelve 0", (await lim(cA, tenantB.id, "max_teams_per_tournament")) === 0);

    const ent = await cB.rpc("tenant_entitlements", { p_tenant_id: tenantB.id });
    const catalog = await admin.from("feature_catalog").select("feature_key", { count: "exact", head: true });
    check("tenant_entitlements devuelve todas las funciones", ent.data?.length === catalog.count, `${ent.data?.length} vs ${catalog.count}`);
    const players = ent.data?.find((r) => r.feature_key === "max_players_per_tournament");
    check("tenant_entitlements: Bronce = 75 jugadores", players?.limit_value === 75 && players?.enabled === true);
    const entOther = await cA.rpc("tenant_entitlements", { p_tenant_id: tenantB.id });
    check("tenant_entitlements de otro tenant viene vacío", (entOther.data ?? []).length === 0);
  }

  console.log("\n== Cambios de plan y estado (Super Admin) ==");
  {
    const cS = await signedInClient(adminS);

    const ov0 = await overview(cS, tenantS.id);
    check("Cliente Plata activo: acceso completo", ov0?.plan_code === "silver" && ov0?.access_state === "full", JSON.stringify(ov0));

    const toDue = await rootC.rpc("admin_set_subscription_status", { p_tenant_id: tenantS.id, p_status: "past_due", p_note: "Prueba" });
    check("Marcar en mora un plan de pago", !toDue.error, toDue.error?.message);
    const ov1 = await overview(cS, tenantS.id);
    check("En mora dentro de la gracia: acceso 'grace'", ov1?.access_state === "grace", JSON.stringify(ov1));
    const upGrace = await cS.from("tenants").update({ name: "Editado en gracia" }).eq("id", tenantS.id).select("id");
    check("En gracia: todavía puede editar", upGrace.data?.length === 1, JSON.stringify(upGrace));

    await admin.from("tenants").update({ past_due_since: daysAgo(4) }).eq("id", tenantS.id);
    const ov2 = await overview(cS, tenantS.id);
    check("Pasada la gracia: acceso 'read_only'", ov2?.access_state === "read_only", JSON.stringify(ov2));
    const upRo = await cS.from("tenants").update({ name: "Editado en mora" }).eq("id", tenantS.id).select("id");
    check("Solo lectura: NO puede editar", !upRo.error && upRo.data?.length === 0, JSON.stringify(upRo));
    const readRo = await cS.from("profiles").select("id");
    check("Solo lectura: SIGUE pudiendo leer sus datos", (readRo.data?.length ?? 0) === 1);

    const toFree = await rootC.rpc("admin_set_tenant_plan", { p_tenant_id: tenantS.id, p_plan_id: plans.bronze, p_note: "Baja a gratis" });
    check("Cambiar de plan de pago a gratis", !toFree.error, toFree.error?.message);
    const ov3 = await overview(cS, tenantS.id);
    check("Plan gratuito: sale de la mora y vuelve a acceso completo", ov3?.plan_code === "bronze" && ov3?.subscription_status === "active" && ov3?.access_state === "full", JSON.stringify(ov3));

    const freeDue = await rootC.rpc("admin_set_subscription_status", { p_tenant_id: tenantS.id, p_status: "past_due" });
    check("Un plan gratuito NO puede entrar en mora", !!freeDue.error);

    const evS = await rootC.from("tenant_subscription_events").select("event_type").eq("tenant_id", tenantS.id);
    // mora → cambio de plan → salida automática de la mora
    const types = (evS.data ?? []).map((e) => e.event_type).sort().join(",");
    check(
      "Se registraron los 3 cambios (mora, plan, salida de mora)",
      types === "plan_changed,status_changed,status_changed",
      types,
    );
    const evAsTenant = await cS.from("tenant_subscription_events").select("id");
    check("El cliente NO ve el historial de suscripción", !evAsTenant.error && (evAsTenant.data ?? []).length === 0);
    const evWrite = await cS.from("tenant_subscription_events").insert({ tenant_id: tenantS.id, event_type: "plan_changed" });
    check("El cliente NO puede escribir en el historial", !!evWrite.error);
    const evUpdate = await rootC.from("tenant_subscription_events").update({ note: "x" }).eq("tenant_id", tenantS.id).select("id");
    check("El historial es inmutable (ni el Super Admin lo edita)", !!evUpdate.error);
  }

  console.log("\n== Mora, suspensión y funciones pausadas (tenant Oro) ==");
  {
    const cA = await signedInClient(adminA);
    const has = async (key) => (await cA.rpc("tenant_has_feature", { p_tenant_id: tenantA.id, p_feature_key: key })).data;

    await rootC.rpc("admin_set_subscription_status", { p_tenant_id: tenantA.id, p_status: "past_due" });
    const first = await overview(cA, tenantA.id);
    await rootC.rpc("admin_set_subscription_status", { p_tenant_id: tenantA.id, p_status: "past_due" });
    const second = await overview(cA, tenantA.id);
    check("Repetir 'en mora' no reinicia la cuenta de gracia", first?.past_due_since === second?.past_due_since);
    check("En gracia: el respaldo en Sheets sigue activo", (await has("sheets_backup")) === true);

    await admin.from("tenants").update({ past_due_since: daysAgo(5) }).eq("id", tenantA.id);
    check("Solo lectura: el respaldo en Sheets se PAUSA", (await has("sheets_backup")) === false);
    check("Solo lectura: los webhooks se PAUSAN", (await has("outbound_webhooks")) === false);
    check("Solo lectura: la API se PAUSA", (await has("read_api")) === false);
    check("Solo lectura: la exportación manual SIGUE activa", (await has("data_export")) === true);
    const ent = await cA.rpc("tenant_entitlements", { p_tenant_id: tenantA.id });
    check("tenant_entitlements refleja la pausa", ent.data?.find((r) => r.feature_key === "sheets_backup")?.enabled === false);

    await rootC.rpc("admin_set_subscription_status", { p_tenant_id: tenantA.id, p_status: "suspended", p_note: "Prueba" });
    const ovSus = await overview(cA, tenantA.id);
    check("Suspendido: acceso 'suspended'", ovSus?.access_state === "suspended", JSON.stringify(ovSus));
    const upSus = await cA.from("tenants").update({ name: "Suspendido edita" }).eq("id", tenantA.id).select("id");
    check("Suspendido: NO puede editar", !upSus.error && upSus.data?.length === 0);
    const readSus = await cA.from("profiles").select("id");
    check("Suspendido: sigue leyendo sus datos", (readSus.data?.length ?? 0) === 2);

    await rootC.rpc("admin_set_subscription_status", { p_tenant_id: tenantA.id, p_status: "canceled" });
    const ovCan = await overview(cA, tenantA.id);
    check("Cancelado: fecha de eliminación = cancelación + retención", !!ovCan?.purge_eligible_at && ovCan?.access_state === "canceled", JSON.stringify(ovCan));

    await rootC.rpc("admin_set_subscription_status", { p_tenant_id: tenantA.id, p_status: "active" });
    check("Reactivado: el respaldo en Sheets vuelve", (await has("sheets_backup")) === true);
    const upBack = await cA.from("tenants").update({ name: "Reactivado" }).eq("id", tenantA.id).select("id");
    check("Reactivado: vuelve a poder editar", upBack.data?.length === 1);
  }

  console.log("\n== Límites del plan validados en la base de datos ==");
  {
    const b2 = await tryMakeUser("admin-b2", "tenant_admin", tenantB.id);
    check("Bronce (1 admin): el 2.º administrador se rechaza", !b2.ok && /administrador/i.test(b2.message), b2.message);

    const opB = await tryMakeUser("op-b", "operator", tenantB.id);
    check("Bronce: no se pueden crear operadores", !opB.ok && /operadores/i.test(opB.message), opB.message);

    const tenantT = await makeTenant("t", "silver");
    const t1 = await tryMakeUser("admin-t1", "tenant_admin", tenantT.id);
    const t2 = await tryMakeUser("admin-t2", "tenant_admin", tenantT.id);
    const t3 = await tryMakeUser("admin-t3", "tenant_admin", tenantT.id);
    check("Plata (2 admins): el 1.º y el 2.º entran", t1.ok && t2.ok);
    check("Plata (2 admins): el 3.º se rechaza", !t3.ok, t3.message);
    const opT = await tryMakeUser("op-t", "operator", tenantT.id);
    check("Plata: no incluye operadores (vocalía online es Oro)", !opT.ok, opT.message);

    // Oro ilimitado y luego bajada a Bronce con exceso
    const a2 = await tryMakeUser("admin-a2", "tenant_admin", tenantA.id);
    const a3 = await tryMakeUser("admin-a3", "tenant_admin", tenantA.id);
    check("Oro (ilimitado): entran administradores adicionales", a2.ok && a3.ok);

    const down = await rootC.rpc("admin_set_tenant_plan", { p_tenant_id: tenantA.id, p_plan_id: plans.bronze });
    check("Bajada Oro → Bronce con 3 administradores", !down.error, down.error?.message);
    const keep = await admin.from("profiles").select("id").eq("tenant_id", tenantA.id).eq("role", "tenant_admin").eq("is_active", true);
    check("Se CONSERVA lo existente (3 administradores activos)", keep.data?.length === 3, String(keep.data?.length));
    const a4 = await tryMakeUser("admin-a4", "tenant_admin", tenantA.id);
    check("Tras bajar de plan: se BLOQUEA crear nuevos", !a4.ok, a4.message);

    if (a3.ok) {
      await admin.from("profiles").update({ is_active: false }).eq("id", a3.user.id);
      const react = await admin.from("profiles").update({ is_active: true }).eq("id", a3.user.id);
      check("Reactivar un administrador por encima del límite se rechaza", !!react.error, JSON.stringify(react));
    }
  }
  // ---------------------------------------------------------------- 1C
  // N = Oro (admin + operador) · M = Plata · marca y avisos
  const tenantN = await makeTenant("n", "gold");
  const tenantM = await makeTenant("m", "silver");
  const adminN = await makeUser("admin-n", "tenant_admin", tenantN.id);
  const opN = await makeUser("op-n", "operator", tenantN.id);
  const adminM = await makeUser("admin-m", "tenant_admin", tenantM.id);

  console.log("\n== Avisos: quién los ve y cómo se generan ==");
  {
    const cN = await signedInClient(adminN);
    const cOpN = await signedInClient(opN);
    const cM = await signedInClient(adminM);
    const kinds = async (c) =>
      ((await c.from("notifications").select("kind").order("id")).data ?? []).map((n) => n.kind);

    await rootC.rpc("admin_set_subscription_status", { p_tenant_id: tenantN.id, p_status: "past_due" });
    check("Marcar en mora avisa al administrador", (await kinds(cN)).join() === "billing_past_due", (await kinds(cN)).join());
    check("El operador NO ve avisos del cliente", (await kinds(cOpN)).length === 0);
    check("Otro cliente NO ve esos avisos", (await kinds(cM)).length === 0);
    check("Sin leer = 1", (await cN.rpc("my_unread_notifications")).data === 1);

    await cN.rpc("sync_my_notifications");
    await cN.rpc("sync_my_notifications");
    check("Sincronizar varias veces no duplica avisos", (await kinds(cN)).length === 1);

    // M entra en mora hace 5 días (pasada la gracia) sin haber pasado por el Backoffice
    await admin
      .from("tenants")
      .update({ subscription_status: "past_due", past_due_since: daysAgo(5) })
      .eq("id", tenantM.id);
    await cM.rpc("sync_my_notifications");
    const missed = await cM.from("notifications").select("kind, created_at").order("created_at");
    check(
      "Un cliente que no entró en días recibe los 3 hitos de la mora",
      JSON.stringify((missed.data ?? []).map((n) => n.kind)) ===
        JSON.stringify(["billing_past_due", "billing_grace_ending", "billing_read_only"]),
      JSON.stringify(missed.data),
    );
    await cM.rpc("sync_my_notifications");
    check("Repetir no crea más", ((await cM.from("notifications").select("id")).data ?? []).length === 3);

    const ids = ((await cN.from("notifications").select("id")).data ?? []).map((n) => n.id);
    const mark = await cN.from("notification_reads").upsert(ids.map((id) => ({ notification_id: id, user_id: adminN.id })), { onConflict: "notification_id,user_id", ignoreDuplicates: true });
    check("Puede marcar sus avisos como leídos", !mark.error, mark.error?.message);
    check("Sin leer baja a 0", (await cN.rpc("my_unread_notifications")).data === 0);

    const foreign = ((await admin.from("notifications").select("id").eq("tenant_id", tenantM.id)).data ?? [])[0];
    const markForeign = await cN.from("notification_reads").insert({ notification_id: foreign.id, user_id: adminN.id });
    check("NO puede marcar avisos que no ve", !!markForeign.error);
    const markAs = await cN.from("notification_reads").insert({ notification_id: ids[0], user_id: adminM.id });
    check("NO puede marcar leídos en nombre de otro usuario", !!markAs.error);

    await rootC.rpc("admin_set_subscription_status", { p_tenant_id: tenantN.id, p_status: "suspended" });
    await rootC.rpc("admin_set_subscription_status", { p_tenant_id: tenantN.id, p_status: "active" });
    await rootC.rpc("admin_set_tenant_plan", { p_tenant_id: tenantN.id, p_plan_id: plans.silver });
    await rootC.rpc("admin_set_tenant_plan", { p_tenant_id: tenantN.id, p_plan_id: plans.gold });
    const all = await kinds(cN);
    check(
      "Suspender, reactivar y cambiar de plan generan avisos",
      ["billing_suspended", "billing_active", "plan_changed"].every((k) => all.includes(k)),
      all.join(),
    );
    const rootTenantNotes = await rootC.from("notifications").select("id").eq("audience", "tenant");
    check("El Super Admin no recibe los avisos de los clientes", (rootTenantNotes.data ?? []).length === 0);
  }

  console.log("\n== Solicitud de cambio de plan ==");
  {
    const cM = await signedInClient(adminM);
    const cN = await signedInClient(adminN);
    const cOpN = await signedInClient(opN);

    const first = await cM.rpc("request_plan_upgrade", { p_plan_id: plans.gold, p_message: "Queremos vocalía online" });
    check("El administrador puede solicitar otro plan", !first.error && first.data === true, first.error?.message);
    const again = await cM.rpc("request_plan_upgrade", { p_plan_id: plans.gold });
    check("Repetir la misma solicitud el mismo día no duplica", !again.error && again.data === false);
    const own = await cM.rpc("request_plan_upgrade", { p_plan_id: plans.silver });
    check("No se puede solicitar el plan que ya tiene", !!own.error);
    const long = await cM.rpc("request_plan_upgrade", { p_plan_id: plans.bronze, p_message: "x".repeat(301) });
    check("El mensaje largo se rechaza", !!long.error);
    const op = await cOpN.rpc("request_plan_upgrade", { p_plan_id: plans.silver });
    check("Un operador NO puede solicitar cambios de plan", !!op.error);

    const req = await rootC.from("notifications").select("kind, tenant_id, title").eq("audience", "platform");
    const mine = (req.data ?? []).filter((n) => n.tenant_id === tenantM.id);
    check("El Super Admin recibe la solicitud", mine.length === 1 && mine[0].kind === "upgrade_requested", JSON.stringify(req.data));
    const others = await cN.from("notifications").select("kind").eq("audience", "platform");
    check("Los clientes NO ven avisos de la plataforma", (others.data ?? []).length === 0);
  }

  console.log("\n== Canal de correo previsto (entregas por canal) ==");
  {
    const d1 = await admin.from("notification_deliveries").select("channel, status");
    check("Cada aviso tiene su entrega 'in_app' enviada", (d1.data ?? []).some((d) => d.channel === "in_app" && d.status === "sent"));
    check("Con el canal de correo apagado no se crean entregas por correo", !(d1.data ?? []).some((d) => d.channel === "email"));

    const cN = await signedInClient(adminN);
    const clientRead = await cN.from("notification_deliveries").select("id");
    check("Los clientes NO pueden leer las entregas", !!clientRead.error || (clientRead.data ?? []).length === 0);

    await admin.from("platform_settings").update({ email_channel_enabled: true }).eq("id", true);
    await rootC.rpc("admin_set_tenant_plan", { p_tenant_id: tenantN.id, p_plan_id: plans.silver });
    const d2 = await admin.from("notification_deliveries").select("channel, status").eq("channel", "email");
    check("Con el canal de correo encendido nacen entregas 'email' pendientes", (d2.data ?? []).some((d) => d.status === "pending"), JSON.stringify(d2.data));
    await admin.from("platform_settings").update({ email_channel_enabled: false }).eq("id", true);
    await rootC.rpc("admin_set_tenant_plan", { p_tenant_id: tenantN.id, p_plan_id: plans.gold });
  }

  console.log("\n== Marca del cliente (validada en la base de datos) ==");
  {
    const cB = await signedInClient(adminB);
    const cN = await signedInClient(adminN);
    const bronzeColor = await cB.from("tenants").update({ brand_primary: "#112233" }).eq("id", tenantB.id).select("id");
    check("Bronce: NO puede poner colores", !!bronzeColor.error, JSON.stringify(bronzeColor));
    const bronzeLogo = await cB.from("tenants").update({ logo_path: `${tenantB.id}/logo.png` }).eq("id", tenantB.id).select("id");
    check("Bronce: NO puede poner logo", !!bronzeLogo.error);
    const bronzeClear = await cB.from("tenants").update({ brand_primary: null }).eq("id", tenantB.id).select("id");
    check("Bronce: sí puede dejar la marca vacía", !bronzeClear.error && bronzeClear.data?.length === 1);

    const goldColor = await cN.from("tenants").update({ brand_primary: "#112233", brand_secondary: "#AABBCC" }).eq("id", tenantN.id).select("id");
    check("Oro: puede poner colores", !goldColor.error && goldColor.data?.length === 1, JSON.stringify(goldColor));
    const badHex = await cN.from("tenants").update({ brand_primary: "amarillo" }).eq("id", tenantN.id).select("id");
    check("Un color inválido se rechaza", !!badHex.error);

    // bajar de plan: se conserva lo existente y se bloquea cambiar
    await rootC.rpc("admin_set_tenant_plan", { p_tenant_id: tenantN.id, p_plan_id: plans.bronze });
    const kept = await admin.from("tenants").select("brand_primary").eq("id", tenantN.id).single();
    check("Al bajar de plan se conservan los colores guardados", kept.data?.brand_primary === "#112233");
    const changeAfter = await cN.from("tenants").update({ brand_primary: "#000000" }).eq("id", tenantN.id).select("id");
    check("Al bajar de plan ya no puede cambiarlos", !!changeAfter.error);
    const removeAfter = await cN.from("tenants").update({ brand_primary: null, brand_secondary: null }).eq("id", tenantN.id).select("id");
    check("Al bajar de plan SÍ puede quitar su marca", !removeAfter.error && removeAfter.data?.length === 1, JSON.stringify(removeAfter));
    await rootC.rpc("admin_set_tenant_plan", { p_tenant_id: tenantN.id, p_plan_id: plans.gold });
  }

  console.log("\n== Logo: almacenamiento por cliente ==");
  {
    // PNG válido de 1×1 píxel
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const bucket = (c) => c.storage.from("tenant-logos");

    // M está en solo lectura (mora de 5 días): primero devolvemos su acceso completo
    await admin.from("tenants").update({ subscription_status: "active", past_due_since: null }).eq("id", tenantM.id);
    const cM = await signedInClient(adminM);
    const cB = await signedInClient(adminB);
    const cN = await signedInClient(adminN);

    const ownPath = `${tenantM.id}/logo-test.png`;
    const up = await bucket(cM).upload(ownPath, png, { contentType: "image/png" });
    check("Plata: sube el logo a su carpeta", !up.error, up.error?.message);

    const pub = bucket(cM).getPublicUrl(ownPath).data.publicUrl;
    const res = await fetch(pub);
    check("El logo es público (lo ven los hinchas sin iniciar sesión)", res.ok && res.headers.get("content-type") === "image/png", `${res.status}`);

    const foreign = await bucket(cM).upload(`${tenantN.id}/hack.png`, png, { contentType: "image/png" });
    check("NO puede subir a la carpeta de otro cliente", !!foreign.error);
    const bronze = await bucket(cB).upload(`${tenantB.id}/logo.png`, png, { contentType: "image/png" });
    check("Bronce: NO puede subir logo (su plan no incluye marca)", !!bronze.error);
    const notImage = await bucket(cM).upload(`${tenantM.id}/nota.txt`, Buffer.from("hola"), { contentType: "text/plain" });
    check("Solo se aceptan imágenes PNG, JPG o WebP", !!notImage.error);
    const opUp = await signedInClient(opN).then((c) => bucket(c).upload(`${tenantN.id}/op.png`, png, { contentType: "image/png" }));
    check("Un operador NO puede subir logo", !!opUp.error);

    await admin.from("tenants").update({ subscription_status: "past_due", past_due_since: daysAgo(5) }).eq("id", tenantM.id);
    const ro = await bucket(cM).upload(`${tenantM.id}/logo-ro.png`, png, { contentType: "image/png" });
    check("En solo lectura NO puede subir logos", !!ro.error);
    const roDel = await bucket(cM).remove([ownPath]);
    check("En solo lectura NO puede borrar logos", (roDel.data ?? []).length === 0);

    await admin.from("tenants").update({ subscription_status: "active", past_due_since: null }).eq("id", tenantM.id);
    const del = await bucket(cM).remove([ownPath]);
    check("Con acceso completo puede borrar su logo", (del.data ?? []).length === 1, JSON.stringify(del));

    const ok2 = await bucket(cN).upload(`${tenantN.id}/logo.png`, png, { contentType: "image/png" });
    check("Oro: sube el logo a su carpeta", !ok2.error, ok2.error?.message);
  }

  console.log("\n== tenant_entitlements: incluida vs en pausa ==");
  {
    const cN = await signedInClient(adminN);
    const cB = await signedInClient(adminB);
    await admin.from("tenants").update({ subscription_status: "past_due", past_due_since: daysAgo(6) }).eq("id", tenantN.id);
    const ent = await cN.rpc("tenant_entitlements", { p_tenant_id: tenantN.id });
    const sheets = ent.data?.find((r) => r.feature_key === "sheets_backup");
    check(
      "Oro en solo lectura: Sheets está en el plan pero EN PAUSA",
      sheets?.in_plan === true && sheets?.paused === true && sheets?.enabled === false,
      JSON.stringify(sheets),
    );
    const exportManual = ent.data?.find((r) => r.feature_key === "data_export");
    check("La exportación manual no se pausa", exportManual?.enabled === true && exportManual?.paused === false);
    const entB = await cB.rpc("tenant_entitlements", { p_tenant_id: tenantB.id });
    const api = entB.data?.find((r) => r.feature_key === "read_api");
    check("Bronce: la API no está en el plan (y no es una pausa)", api?.in_plan === false && api?.paused === false && api?.enabled === false);
    await admin.from("tenants").update({ subscription_status: "active", past_due_since: null }).eq("id", tenantN.id);
  }
} catch (err) {
  console.error(`\nERROR: ${err.message}`);
  results.push(false);
} finally {
  // Logos de prueba en el almacenamiento
  for (const id of tenantIds) {
    const { data: files } = await admin.storage.from("tenant-logos").list(id);
    if (files?.length) await admin.storage.from("tenant-logos").remove(files.map((f) => `${id}/${f.name}`));
  }
  await admin.from("platform_settings").update({ email_channel_enabled: false }).eq("id", true);
  for (const id of userIds) await admin.auth.admin.deleteUser(id); // borra también el perfil
  if (tenantIds.length > 0) await admin.from("tenants").delete().in("id", tenantIds);
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas.`);
process.exitCode = failed === 0 ? 0 : 1;
