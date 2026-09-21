import { AppHeader } from "@/components/app-header";
import { requireSuperAdmin } from "@/lib/auth/session";
import { BackofficeNav } from "./nav";

export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSuperAdmin();

  return (
    <>
      <AppHeader ctx={ctx} context="Backoffice" />
      <BackofficeNav />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
