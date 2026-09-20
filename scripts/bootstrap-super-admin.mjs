// Crea el primer Super Admin (propietario de EffyOne). Se ejecuta una sola vez:
//   npm run seed:super-admin
import { adminClient, createUserWithProfile, requireEnv } from "./lib.mjs";

async function main() {
  const env = requireEnv("SUPER_ADMIN_BOOTSTRAP_EMAIL");
  const fullName = process.env.SUPER_ADMIN_BOOTSTRAP_NAME || "Propietario EffyOne";
  const admin = adminClient();

  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "super_admin")
    .limit(1);
  if (existingError) {
    console.error(`No se pudo consultar la base: ${existingError.message}`);
    console.error("¿Ya aplicaste la migración con 'npm run db:push'?");
    process.exitCode = 1;
    return;
  }
  if (existing.length > 0) {
    console.log("Ya existe un Super Admin. No se creó otro.");
    return;
  }

  const user = await createUserWithProfile(admin, {
    email: env.SUPER_ADMIN_BOOTSTRAP_EMAIL.trim().toLowerCase(),
    fullName,
    role: "super_admin",
  });

  console.log("");
  console.log("Super Admin creado. Guarda estos datos (la contraseña no se vuelve a mostrar):");
  console.log(`  Correo:               ${user.email}`);
  console.log(`  Contraseña temporal:  ${user.password}`);
  console.log("En tu primer ingreso el sistema te pedirá crear una contraseña propia.");
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
