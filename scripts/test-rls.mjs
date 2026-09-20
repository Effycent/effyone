// Prueba automática de aislamiento multi-tenant contra tu proyecto Supabase:
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

async function makeTenant(label) {
  const { data, error } = await admin
    .from("tenants")
    .insert({
      slug: `rlstest-${label}-${suffix}`,
      name: `RLS Test ${label.toUpperCase()}`,
      country: "EC",
      timezone: "America/Guayaquil",
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

try {
  const tenantA = await makeTenant("a");
  const tenantB = await makeTenant("b");
  const adminA = await makeUser("admin-a", "tenant_admin", tenantA.id);
  const opA = await makeUser("op-a", "operator", tenantA.id);
  const adminB = await makeUser("admin-b", "tenant_admin", tenantB.id);
  const root = await makeUser("root", "super_admin", null);

  console.log("\n== Visitante sin sesión ==");
  {
    const anon = anonClient();
    const t = await anon.from("tenants").select("id");
    const p = await anon.from("profiles").select("id");
    check("No puede leer tenants", !!t.error || (t.data ?? []).length === 0);
    check("No puede leer profiles", !!p.error || (p.data ?? []).length === 0);
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
    const c = await signedInClient(root);
    const t = await c.from("tenants").select("id").in("id", [tenantA.id, tenantB.id]);
    check("Ve los tenants A y B", t.data?.length === 2);
    const p = await c.from("profiles").select("id").in("id", [adminA.id, opA.id, adminB.id, root.id]);
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
} catch (err) {
  console.error(`\nERROR: ${err.message}`);
  results.push(false);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id); // borra también el perfil
  if (tenantIds.length > 0) await admin.from("tenants").delete().in("id", tenantIds);
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas.`);
process.exitCode = failed === 0 ? 0 : 1;
