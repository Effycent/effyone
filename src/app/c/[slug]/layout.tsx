import { AdBanner } from "@/components/ad-banner";
import { AppHeader } from "@/components/app-header";
import { BillingBanner } from "@/components/billing-banner";
import { TenantNav } from "@/components/tenant-nav";
import { cheapestPlanWith, getTenantPanel, tenantPath } from "@/lib/tenant/panel";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const panel = await getTenantPanel(slug);

  const showManagement = panel.canManage || panel.isSupportView;
  const planHref = panel.canManage ? tenantPath(slug, "/plan") : undefined;
  const showAds = !panel.entitlements.get("ad_free")?.enabled;

  return (
    <>
      <AppHeader
        ctx={panel.ctx}
        context={panel.tenant.name}
        notifications={
          panel.canManage ? { href: tenantPath(slug, "/notificaciones"), unread: panel.unread } : undefined
        }
      />
      <TenantNav slug={slug} showManagement={showManagement} unread={panel.unread} />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        {panel.isSupportView ? (
          <p className="border-l-4 border-brand bg-asphalt-900 px-4 py-3 text-sm text-asphalt-200">
            Vista de soporte: estás viendo el panel de este cliente como Super Admin. Los cambios se
            hacen desde el Backoffice.
          </p>
        ) : null}
        <BillingBanner overview={panel.overview} timezone={panel.tenant.timezone} planHref={planHref} />
        {showAds ? <AdBanner planName={cheapestPlanWith(panel, "ad_free")?.name} planHref={planHref} /> : null}
        {children}
      </main>
    </>
  );
}
