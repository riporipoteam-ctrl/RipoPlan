"use client";

/**
 * Branded launch / loading screen. Replaces the bare "Loading…" text so there's
 * never a flat black screen — an animated gradient field with the AskAI spark,
 * the wordmark, and a soft progress shimmer. Matches the native iOS splash.
 */
export function Splash({ label = "Loading" }: { label?: string }) {
  return (
    <div className="splash-root fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden">
      {/* drifting aurora blobs */}
      <div className="splash-blob splash-blob-a" />
      <div className="splash-blob splash-blob-b" />

      <div className="relative flex flex-col items-center">
        <div className="splash-mark animate-pop-in">
          <Spark />
        </div>
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight">
          <span className="gradient-text">AskAI</span>
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--muted)]">{label}</p>
        <div className="splash-bar mt-5">
          <span />
        </div>
      </div>
    </div>
  );
}

function Spark() {
  return (
    <svg width="76" height="76" viewBox="0 0 1024 1024" aria-hidden>
      <defs>
        <linearGradient id="sx" x1="0.15" y1="0.05" x2="0.9" y2="1">
          <stop offset="0" stopColor="#b06bff" />
          <stop offset="0.5" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#ff5ea8" />
        </linearGradient>
      </defs>
      <path
        d="M512 250 C 540 405, 607 472, 762 500 C 607 528, 540 595, 512 750 C 484 595, 417 528, 262 500 C 417 472, 484 405, 512 250 Z"
        fill="url(#sx)"
      />
      <path
        d="M724 312 C 734 360, 758 384, 806 394 C 758 404, 734 428, 724 476 C 714 428, 690 404, 642 394 C 690 384, 714 360, 724 312 Z"
        fill="url(#sx)"
        opacity="0.9"
      />
    </svg>
  );
}
