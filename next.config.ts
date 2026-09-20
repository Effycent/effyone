import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Fija la raíz del proyecto: evita que Next tome otro package-lock.json
  // de una carpeta superior (por ejemplo, Descargas).
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
