"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // El navegador puede bloquear el portapapeles; el texto sigue visible para copiarlo a mano.
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={copy} className="h-10 px-4 text-base">
      {copied ? "Copiado" : label}
    </Button>
  );
}
