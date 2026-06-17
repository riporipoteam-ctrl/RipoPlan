import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatRelativeLabel(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.max(1, Math.round(diffMs / 60000));

  if (diffMin < 60) {
    return `${diffMin}m`;
  }

  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  return `${Math.round(diffHours / 24)}d`;
}

export function toTitleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}
