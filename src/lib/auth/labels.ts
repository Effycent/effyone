import type { AppRole } from "@/types/database";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  tenant_admin: "Administrador",
  operator: "Operador",
};
