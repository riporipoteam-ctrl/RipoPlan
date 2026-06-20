import { emojiFor } from "@/lib/emoji";
import clsx from "clsx";

export function AgentAvatar({
  emoji,
  color,
  size = 36,
  rounded = "lg",
  withDot = false,
}: {
  emoji?: string | null;
  color?: string | null;
  size?: number;
  rounded?: "lg" | "full";
  withDot?: boolean;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={clsx(
          "flex items-center justify-center text-white",
          rounded === "lg" ? "rounded-xl" : "rounded-full"
        )}
        style={{ width: size, height: size, background: color || "#a855f7", fontSize: size * 0.5 }}
      >
        <span>{emojiFor(emoji)}</span>
      </div>
      {withDot && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-[var(--card)]" />
      )}
    </div>
  );
}

export function UserAvatar({
  name,
  color,
  size = 36,
}: {
  name?: string | null;
  color?: string | null;
  size?: number;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color || "#ef4444", fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}
