import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Los logos suben por una Server Action; el tope por defecto (1 MB) quedaría
  // justo con el archivo. El límite real del logo (1 MB) se valida en la acción.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Fija la raíz del proyecto: evita que Next tome otro package-lock.json
  // de una carpeta superior (por ejemplo, Descargas).
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
