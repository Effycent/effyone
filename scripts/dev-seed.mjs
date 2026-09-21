// Crea 2 clientes de demostración para probar a mano en el navegador:
//   - Complejo Demo Norte: plan Oro, con Administrador y Operador
//   - Club Demo Sur:       plan Bronce, solo con Administrador
//   npm run seed:dev
// Es seguro repetirlo: no duplica lo que ya existe.
import { adminClient, createUserWithProfile } from "./lib.mjs";

const DEMOS = [
  { slug: "demo-norte", name: "Complejo Demo Norte", planCode: "gold", withOperator: true },
  { slug: "demo-sur", name: "Club Demo Sur", planCode: "bronze", withOperator: false },
];

async function main() {
  const admin = adminClient();

  const { data: plans, error: plansError } = await admin.from("plans").select("id, code");
  if (plansError) throw new Error(`No se pudieron leer los planes: ${plansError.message}`);
  const planId = (code) => {
    const plan = plans.find((p) => p.code === code);
    if (!plan) throw new Error(`Falta el plan "${code}". ¿Aplicaste la migración con 'npm run db:push'?`);
    return plan.id;
  };

  for (const demo of DEMOS) {
    let { data: tenant } = await admin
      .from("tenants")
      .select("id")
      .eq("slug", demo.slug)
      .maybeSingle();

    if (!tenant) {
      const { data, error } = await admin
        .from("tenants")
        .insert({
          slug: demo.slug,
          name: demo.name,
          country: "EC",
          timezone: "America/Guayaquil",
          plan_id: planId(demo.planCode),
        })
        .select("id")
        .single();
      if (error) throw new Error(`No se pudo crear ${demo.slug}: ${error.message}`);
      tenant = data;
    }

    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id);
    if (count && count > 0) {
      console.log(`${demo.slug}: ya tiene usuarios, se omite.`);
      continue;
    }

    const people = [
      { email: `admin.${demo.slug}@example.com`, fullName: `Admin ${demo.name}`, role: "tenant_admin" },
    ];
    if (demo.withOperator) {
      people.push({
        email: `operador.${demo.slug}@example.com`,
        fullName: `Operador ${demo.name}`,
        role: "operator",
      });
    }

    console.log(`\n${demo.name}  (/c/${demo.slug})  plan: ${demo.planCode}`);
    for (const person of people) {
      const user = await createUserWithProfile(admin, { ...person, tenantId: tenant.id });
      console.log(`  ${person.role.padEnd(12)} ${user.email}   contraseña temporal: ${user.password}`);
    }
  }
  console.log("\nListo.");
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
