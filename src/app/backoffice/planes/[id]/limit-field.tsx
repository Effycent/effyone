"use client";

import { useState } from "react";

type Props = {
  featureKey: string;
  unit: string | null;
  /** null = ilimitado */
  initialValue: number | null;
};

/** Campo de límite numérico con casilla "Ilimitado". */
export function LimitField({ featureKey, unit, initialValue }: Props) {
  const [unlimited, setUnlimited] = useState(initialValue === null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        name={`l_${featureKey}`}
        aria-label={`Límite de ${unit ?? featureKey}`}
        inputMode="numeric"
        defaultValue={initialValue ?? ""}
        disabled={unlimited}
        placeholder={unlimited ? "∞" : "0"}
        className="h-10 w-28 border border-asphalt-600 bg-asphalt-900 px-3 text-right tabular-nums text-white focus:border-brand focus:outline-none disabled:opacity-40"
      />
      {unit ? <span className="text-sm text-asphalt-400">{unit}</span> : null}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name={`u_${featureKey}`}
          checked={unlimited}
          onChange={(e) => setUnlimited(e.target.checked)}
          className="h-5 w-5 accent-[#fed306]"
        />
        Ilimitado
      </label>
    </div>
  );
}
