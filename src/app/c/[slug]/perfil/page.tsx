import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { FeatureGate } from "@/components/feature-gate";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { ColorField } from "@/components/ui/color-field";
import { Panel } from "@/components/ui/panel";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { COUNTRY_OPTIONS, TIMEZONES } from "@/lib/geo";
import { logoUrl } from "@/lib/tenant/logo";
import { requireTenantManagerPage } from "@/lib/tenant/panel";
import {
  removeLogoAction,
  updateBrandColorsAction,
  updateProfileAction,
  uploadLogoAction,
} from "./actions";

export const metadata: Metadata = { title: "Perfil" };

const EFFYONE_YELLOW = "#fed306";

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const panel = await requireTenantManagerPage(slug);
  const { tenant } = panel;
  const editable = panel.canManage && panel.canWrite;
  const logo = logoUrl(tenant.logo_path);
  const primary = tenant.brand_primary ?? EFFYONE_YELLOW;
  const secondary = tenant.brand_secondary ?? "#ffffff";

  return (
    <>
      <Panel title="Datos del complejo" description="Cómo se llama tu complejo y dónde está.">
        {editable ? (
          <ActionForm action={updateProfileAction} submitLabel="Guardar datos" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Nombre" name="name" defaultValue={tenant.name} required maxLength={120} />
              <TextField
                label="Dirección web"
                name="slug_display"
                defaultValue={`/c/${tenant.slug}`}
                readOnly
                hint="La define EffyOne. Si necesitas cambiarla, contáctanos."
              />
              <SelectField label="País" name="country" defaultValue={tenant.country} options={COUNTRY_OPTIONS} />
              <SelectField
                label="Zona horaria"
                name="timezone"
                defaultValue={tenant.timezone}
                options={TIMEZONES.map((z) => ({ value: z, label: z }))}
                hint="Se usa para mostrar las fechas y horas de tus partidos."
              />
            </div>
          </ActionForm>
        ) : (
          <dl className="divide-y divide-asphalt-800 text-sm">
            <Row label="Nombre" value={tenant.name} />
            <Row label="Dirección web" value={`/c/${tenant.slug}`} />
            <Row label="País" value={tenant.country} />
            <Row label="Zona horaria" value={tenant.timezone} />
          </dl>
        )}
        {panel.canManage && !panel.canWrite ? (
          <p className="mt-4 text-sm text-asphalt-400">Tu cuenta está en solo lectura: no se pueden guardar cambios.</p>
        ) : null}
      </Panel>

      <FeatureGate slug={slug} feature="tenant_branding">
        <Panel
          title="Tu marca"
          description="Tu logo y tus colores para el panel público que verán tus hinchas."
        >
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-asphalt-200">Vista previa</p>
              <div className="space-y-4 border border-asphalt-700 bg-asphalt-950 p-5">
                <div className="flex h-24 items-center justify-center bg-asphalt-900">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt={`Logo de ${tenant.name}`} className="max-h-20 max-w-full object-contain" />
                  ) : (
                    <span className="text-sm text-asphalt-400">Aún no subes tu logo</span>
                  )}
                </div>
                <p className="font-display text-2xl font-extrabold uppercase" style={{ color: secondary }}>
                  {tenant.name}
                </p>
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-10 items-center px-4 font-display text-base font-bold uppercase tracking-wide text-black"
                    style={{ backgroundColor: primary }}
                  >
                    Ver partidos
                  </span>
                  <span className="text-xs text-asphalt-400">Así se combinarán tus colores.</span>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {editable ? (
                <>
                  <ActionForm action={uploadLogoAction} submitLabel="Subir logo" pendingLabel="Subiendo…" className="space-y-3">
                    <TextField
                      label="Logo (PNG, JPG o WebP · máx. 1 MB)"
                      name="logo"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      required
                      className="pt-2.5 file:mr-4 file:border-0 file:bg-asphalt-700 file:px-3 file:py-1.5 file:text-sm file:text-white"
                    />
                  </ActionForm>
                  {tenant.logo_path ? (
                    <ActionForm
                      action={removeLogoAction}
                      submitLabel="Quitar logo"
                      variant="danger"
                      compact
                      confirmMessage="¿Quitar el logo de tu complejo?"
                      className="space-y-2"
                    >
                      {null}
                    </ActionForm>
                  ) : null}

                  <ActionForm action={updateBrandColorsAction} submitLabel="Guardar colores" className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ColorField label="Color principal" name="brand_primary" defaultValue={primary} />
                      <ColorField label="Color secundario" name="brand_secondary" defaultValue={secondary} />
                    </div>
                    <CheckboxField label="Usar los colores de EffyOne" name="reset" />
                  </ActionForm>
                </>
              ) : (
                <p className="text-sm text-asphalt-400">
                  {panel.canManage
                    ? "Tu cuenta está en solo lectura: no se puede cambiar la marca."
                    : "La marca la gestiona el administrador del cliente."}
                </p>
              )}
            </div>
          </div>
        </Panel>
      </FeatureGate>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-asphalt-400">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
