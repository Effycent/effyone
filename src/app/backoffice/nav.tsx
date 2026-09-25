"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/backoffice", label: "Clientes", match: (p: string) => p === "/backoffice" || p.startsWith("/backoffice/clientes") },
  { href: "/backoffice/planes", label: "Planes", match: (p: string) => p.startsWith("/backoffice/planes") },
  { href: "/backoffice/deportes", label: "Deportes", match: (p: string) => p.startsWith("/backoffice/deportes") },
  { href: "/backoffice/avisos", label: "Avisos", match: (p: string) => p.startsWith("/backoffice/avisos") },
  { href: "/backoffice/ajustes", label: "Ajustes", match: (p: string) => p.startsWith("/backoffice/ajustes") },
];

export function BackofficeNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones del backoffice" className="border-b border-asphalt-700 bg-asphalt-950">
      <div className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`border-b-4 px-4 py-3 font-display text-lg font-bold uppercase tracking-wide transition-colors ${
                active
                  ? "border-brand text-white"
                  : "border-transparent text-asphalt-400 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
