import type { SelectHTMLAttributes } from "react";

type Option = { value: string; label: string; disabled?: boolean };

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Option[];
  hint?: string;
};

export function SelectField({ label, options, hint, id, className = "", ...rest }: Props) {
  const selectId = id ?? rest.name;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={selectId}
        className="block text-xs font-semibold uppercase tracking-widest text-asphalt-200"
      >
        {label}
      </label>
      <select
        {...rest}
        id={selectId}
        aria-describedby={hint ? `${selectId}-hint` : undefined}
        className={`h-12 w-full border border-asphalt-600 bg-asphalt-900 px-3 text-base text-white focus:border-brand focus:outline-none ${className}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={`${selectId}-hint`} className="text-xs text-asphalt-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
