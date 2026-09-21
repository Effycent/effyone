"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  slug: string;
  /** Administradores y soporte ven todas las secciones; los operadores solo el resumen. */
  showManagement: boolean;
  unread: number;
};

export function TenantNav({ slug, showManagement, unread }: Props) {
  const pathname = usePathname();
  const base = `/c/${slug}`;

  const items = [
    { href: base, label: "Resumen", exact: true },
    ...(showManagement
      ? [
          { href: `${base}/equipo`, label: "Equipo" },
          { href: `${base}/plan`, label: "Mi plan" },
          { href: `${base}/perfil`, label: "Perfil" },
          { href: `${base}/notificaciones`, label: "Avisos", count: unread },
        ]
      : []),
  ];

  return (
    <nav aria-label="Secciones del complejo" className="border-b border-asphalt-700 bg-asphalt-950">
      <div className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 whitespace-nowrap border-b-4 px-4 py-3 font-display text-lg font-bold uppercase tracking-wide transition-colors ${
                active ? "border-brand text-white" : "border-transparent text-asphalt-400 hover:text-white"
              }`}
            >
              {item.label}
              {item.count ? (
                <span className="bg-brand px-1.5 text-xs font-bold text-black">{item.count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
