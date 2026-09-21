import "server-only";
import { randomInt } from "node:crypto";

// Sin caracteres ambiguos (0/O, 1/l/I) para que se pueda dictar por teléfono.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Contraseña temporal legible, ej. "Kf7m-Qz3p-Wa9x-Tb4n". Cumple la política de la app. */
export function generateTempPassword(): string {
  for (;;) {
    const groups = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""),
    );
    const password = groups.join("-");
    if (/\d/.test(password) && /[A-Za-z]/.test(password)) return password;
  }
}
