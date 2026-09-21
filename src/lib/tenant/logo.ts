import { getPublicEnv } from "@/lib/env";

export const LOGO_BUCKET = "tenant-logos";
export const LOGO_MAX_BYTES = 1_048_576; // 1 MB

/** URL pública del logo (el bucket es público: lo ven los hinchas sin iniciar sesión). */
export function logoUrl(path: string | null): string | null {
  if (!path) return null;
  const base = getPublicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
}

export type LogoFormat = { ext: "png" | "jpg" | "webp"; mime: "image/png" | "image/jpeg" | "image/webp" };

/**
 * Reconoce el formato por los primeros bytes del archivo (no por su nombre ni
 * por el tipo que declara el navegador, que se pueden falsear).
 */
export function sniffImage(bytes: Uint8Array): LogoFormat | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", mime: "image/png" };
  if (startsWith([0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" };
  // WebP: "RIFF" .... "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}
