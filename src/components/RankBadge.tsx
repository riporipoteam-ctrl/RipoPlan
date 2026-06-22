import { emojiFor } from "@/lib/emoji";
import type { Rank } from "@/lib/types";

/** Small colored badge shown next to an agent's name across the app. */
export function RankBadge({ rank, size = "sm" }: { rank?: Rank | null; size?: "sm" | "md" }) {
  if (!rank) return null;
  const pad = size === "md" ? "px-2 py-0.5 text-xs" : "px-1.5 py-[1px] text-[10px]";
  const color = rank.color || "#a855f7";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold leading-none ${pad}`}
      style={{ background: `${color}1f`, color, border: `1px solid ${color}55` }}
      title={rank.name}
    >
      <span>{emojiFor(rank.badge)}</span>
      <span className="max-w-[120px] truncate">{rank.name}</span>
    </span>
  );
}

/** Just the glyph chip (no label) for tight spaces. */
export function RankDot({ rank }: { rank?: Rank | null }) {
  if (!rank) return null;
  return (
    <span title={rank.name} className="text-xs leading-none">
      {emojiFor(rank.badge)}
    </span>
  );
}
