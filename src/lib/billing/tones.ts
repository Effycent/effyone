import type { AccessState, SubscriptionStatus } from "@/types/database";

export type Tone = "ok" | "warn" | "danger" | "muted";

export const accessTone = (state: AccessState): Tone =>
  state === "full" ? "ok" : state === "grace" ? "warn" : state === "canceled" ? "muted" : "danger";

export const statusTone = (status: SubscriptionStatus): Tone =>
  status === "active" ? "ok" : status === "canceled" ? "muted" : "danger";
