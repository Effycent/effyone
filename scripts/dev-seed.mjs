// Crea 2 clientes de demostración (cada uno con un Administrador y un Operador)
// para probar el aislamiento a mano en el navegador:
//   npm run seed:dev
// Es seguro repetirlo: no duplica lo que ya existe.
import { adminClient, createUserWithProfile } from "./lib.mjs";

const DEMOS = [
  { slug: "demo-norte", name: "Complejo Demo Norte" },
  { slug: "demo-sur", name: "Club Demo Sur" },
];

async function main() {
  const admin = adminClient();

  for (const demo of DEMOS) {
    let { data: tenant } = await admin
      .from("tenants")
      .select("id")
      .eq("slug", demo.slug)
      .maybeSingle();

    if (!tenant) {
      const { data, error } = await admin
        .from("tenants")
        .insert({ slug: demo.slug, name: demo.name, country: "EC", timezone: "America/Guayaquil" })
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
      { email: `operador.${demo.slug}@example.com`, fullName: `Operador ${demo.name}`, role: "operator" },
    ];
    console.log(`\n${demo.name}  (/c/${demo.slug})`);
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
