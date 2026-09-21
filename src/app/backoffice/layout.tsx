import { AppHeader } from "@/components/app-header";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BackofficeNav } from "./nav";

export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSuperAdmin();
  const supabase = await createClient();
  const { data: unread } = await supabase.rpc("my_unread_notifications");

  return (
    <>
      <AppHeader
        ctx={ctx}
        context="Backoffice"
        notifications={{ href: "/backoffice/avisos", unread: unread ?? 0 }}
      />
      <BackofficeNav />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
