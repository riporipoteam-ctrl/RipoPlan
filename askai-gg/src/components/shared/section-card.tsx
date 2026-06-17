import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionCardProps = {
  title?: string;
  eyebrow?: string;
  className?: string;
  children: ReactNode;
};

export function SectionCard({
  title,
  eyebrow,
  className,
  children,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-[0_20px_120px_rgba(17,24,39,0.22)] backdrop-blur-xl",
        className,
      )}
    >
      {(eyebrow || title) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/75">
                {eyebrow}
              </p>
            ) : null}
            {title ? <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2> : null}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}
