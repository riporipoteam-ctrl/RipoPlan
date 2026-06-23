import { emojiFor } from "@/lib/emoji";
import clsx from "clsx";
import {
  Sparkles, Pencil, Search, Wrench, Globe, Bot, Rocket, Brain, BarChart3, Mail,
  Code2, Camera, Calendar, Bell, Zap, Crown, Star, Shield, Gem, Flame, Trophy, type LucideIcon,
} from "lucide-react";

// Clean line-icons instead of OS emoji glyphs for a polished, custom look.
const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, pencil: Pencil, magnifier: Search, wrench: Wrench, globe: Globe,
  robot: Bot, rocket: Rocket, brain: Brain, chart: BarChart3, mail: Mail, code: Code2,
  camera: Camera, calendar: Calendar, bell: Bell, bolt: Zap, crown: Crown, star: Star,
  shield: Shield, gem: Gem, fire: Flame, trophy: Trophy,
};

export function AgentAvatar({
  emoji,
  color,
  imageUrl,
  size = 36,
  rounded = "lg",
  withDot = false,
}: {
  emoji?: string | null;
  color?: string | null;
  imageUrl?: string | null;
  size?: number;
  rounded?: "lg" | "full";
  withDot?: boolean;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className={clsx("object-cover", rounded === "lg" ? "rounded-xl" : "rounded-full")}
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className={clsx(
            "flex items-center justify-center text-white",
            rounded === "lg" ? "rounded-xl" : "rounded-full"
          )}
          style={{ width: size, height: size, background: `linear-gradient(135deg, ${color || "#a855f7"}, ${color || "#a855f7"}cc)`, fontSize: size * 0.5 }}
        >
          {(() => {
            const Icon = emoji ? ICONS[emoji] : undefined;
            return Icon ? <Icon size={Math.round(size * 0.5)} strokeWidth={2.2} /> : <span>{emojiFor(emoji)}</span>;
          })()}
        </div>
      )}
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
