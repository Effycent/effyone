// Países donde EffyOne puede operar (código ISO 3166-1 alfa-2). Se pueden
// ampliar agregando códigos; los nombres salen de Intl en español.
export const COUNTRY_CODES = [
  "EC", "CO", "PE", "MX", "AR", "CL", "BO", "PY", "UY", "VE", "BR",
  "CR", "PA", "GT", "HN", "SV", "NI", "DO", "CU", "PR",
  "US", "CA", "ES", "PT", "IT", "FR", "DE", "GB",
] as const;

const regionNames = new Intl.DisplayNames(["es"], { type: "region" });

export const COUNTRY_OPTIONS = COUNTRY_CODES.map((code) => ({
  value: code,
  label: regionNames.of(code) ?? code,
})).sort((a, b) => a.label.localeCompare(b.label, "es"));

export const TIMEZONES: string[] = Intl.supportedValuesOf("timeZone");

export function isKnownCountry(code: string): boolean {
  return (COUNTRY_CODES as readonly string[]).includes(code);
}

export function isKnownTimezone(zone: string): boolean {
  return TIMEZONES.includes(zone);
}
