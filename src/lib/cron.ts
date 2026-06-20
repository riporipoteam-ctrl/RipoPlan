// Minimal 5-field cron matcher: "min hour dom month dow"
// Supports *, lists (1,2), ranges (1-5), and steps (*/15).
function matchField(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;
  for (const part of field.split(",")) {
    if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      const lo = range === "*" ? min : parseInt(range.split("-")[0], 10);
      const hi = range === "*" || !range.includes("-") ? max : parseInt(range.split("-")[1], 10);
      for (let v = lo; v <= hi; v += step) if (v === value) return true;
    } else if (part.includes("-")) {
      const [lo, hi] = part.split("-").map((n) => parseInt(n, 10));
      if (value >= lo && value <= hi) return true;
    } else if (parseInt(part, 10) === value) {
      return true;
    }
  }
  return false;
}

export function cronMatches(expr: string, date = new Date()): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, dom, month, dow] = parts;
  return (
    matchField(min, date.getUTCMinutes(), 0, 59) &&
    matchField(hour, date.getUTCHours(), 0, 23) &&
    matchField(dom, date.getUTCDate(), 1, 31) &&
    matchField(month, date.getUTCMonth() + 1, 1, 12) &&
    matchField(dow, date.getUTCDay(), 0, 6)
  );
}
