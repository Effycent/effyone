"use client";

import { useEffect, useState } from "react";

type Props = {
  /** Fin de la cuenta regresiva (ISO). */
  endsAt: string;
  /** Hora del servidor al renderizar (ISO): evita depender del reloj del dispositivo. */
  serverNow: string;
};

function format(ms: number): string {
  if (ms <= 0) return "0 min";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} d`);
  if (days > 0 || hours > 0) parts.push(`${hours} h`);
  parts.push(`${String(minutes).padStart(2, "0")} min`);
  return parts.join(" ");
}

/** Cuenta regresiva que se actualiza sola cada 30 segundos. */
export function Countdown({ endsAt, serverNow }: Props) {
  const end = Date.parse(endsAt);
  const [remaining, setRemaining] = useState(end - Date.parse(serverNow));

  useEffect(() => {
    // Diferencia entre el reloj del servidor y el del dispositivo, medida al montar.
    const offset = Date.parse(serverNow) - Date.now();
    const tick = () => setRemaining(end - (Date.now() + offset));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [end, serverNow]);

  return (
    <span className="font-display text-xl font-bold tabular-nums" suppressHydrationWarning>
      {format(remaining)}
    </span>
  );
}
