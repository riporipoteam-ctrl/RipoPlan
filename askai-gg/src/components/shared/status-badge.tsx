import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  label: string;
  tone?: "blue" | "green" | "amber" | "fuchsia" | "slate";
};

const tones: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  blue: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  fuchsia: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200",
  slate: "border-white/10 bg-white/5 text-slate-200",
};

export function StatusBadge({ label, tone = "slate" }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]",
        tones[tone],
      )}
    >
      {label}
    </span>
  );
}
