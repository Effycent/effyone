import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

export function TextField({ label, hint, id, className = "", ...rest }: Props) {
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
        aria-describedby={hint ? `${inputId}-hint` : undefined}
        className={`h-12 w-full border border-asphalt-600 bg-asphalt-900 px-4 text-base text-white placeholder:text-asphalt-400 focus:border-brand focus:outline-none ${className}`}
      />
      {hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-asphalt-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
