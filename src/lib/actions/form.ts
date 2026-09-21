/** Lee un texto de un FormData ("" si falta o no es texto). */
export function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Una casilla marcada llega como "on"; desmarcada no llega. */
export function getBool(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

/** "37", "37.5" o "37,50" → centavos. null si el formato no es válido. */
export function parsePriceToCents(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number.parseFloat(normalized) * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
