type Tone = "ok" | "warn" | "danger" | "muted";

const tones: Record<Tone, string> = {
  ok: "border-ok text-ok",
  warn: "border-brand text-brand",
  danger: "border-danger text-danger",
  muted: "border-asphalt-600 text-asphalt-200",
};

export function Badge({ tone = "muted", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
