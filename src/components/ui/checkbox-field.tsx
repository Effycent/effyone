import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export function CheckboxField({ label, id, className = "", ...rest }: Props) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className={`flex cursor-pointer items-center gap-3 text-sm ${className}`}>
      <input
        {...rest}
        id={inputId}
        type="checkbox"
        className="h-5 w-5 shrink-0 accent-[#fed306]"
      />
      <span>{label}</span>
    </label>
  );
}
