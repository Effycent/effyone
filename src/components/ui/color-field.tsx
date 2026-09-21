import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string };

export function ColorField({ label, id, className = "", ...rest }: Props) {
  const inputId = id ?? rest.name;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className="block text-xs font-semibold uppercase tracking-widest text-asphalt-200"
      >
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        type="color"
        className={`h-12 w-full cursor-pointer border border-asphalt-600 bg-asphalt-900 p-1 ${className}`}
      />
    </div>
  );
}
