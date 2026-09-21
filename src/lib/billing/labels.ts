import type {
  AccessState,
  FeatureCategory,
  SubscriptionStatus,
} from "@/types/database";

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Al día",
  past_due: "En mora",
  suspended: "Suspendido",
  canceled: "Cancelado",
};

export const ACCESS_LABELS: Record<AccessState, string> = {
  full: "Acceso completo",
  grace: "En gracia",
  read_only: "Solo lectura",
  suspended: "Suspendido",
  canceled: "Cancelado",
};

export const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  limits: "Límites",
  tournament: "Torneos",
  public: "Público y marca",
  management: "Gestión deportiva",
  integrations: "Integraciones",
};

export const CATEGORY_ORDER: FeatureCategory[] = [
  "limits",
  "tournament",
  "public",
  "management",
  "integrations",
];

export function formatMoney(cents: number, currency = "USD"): string {
  // es-US muestra "$92.00" (con es genérico saldría "92,00 US$").
  return new Intl.NumberFormat("es-US", { style: "currency", currency }).format(cents / 100);
}

const dateTime = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));
