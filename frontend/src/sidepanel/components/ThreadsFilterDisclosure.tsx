import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface ThreadsFilterDisclosureProps {
  title: string;
  summary: string;
  isActive?: boolean;
  children: ReactNode;
}

export function ThreadsFilterDisclosure({
  title,
  summary,
  isActive = false,
  children,
}: ThreadsFilterDisclosureProps) {
  return (
    <details className="group overflow-hidden rounded-lg border border-border-subtle bg-bg-primary/70">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-text-secondary">
          {title}
        </span>
        <span className="ml-auto flex min-w-0 items-center gap-1.5">
          <span
            className={`min-w-0 truncate text-[11px] font-medium ${
              isActive ? "text-text-primary" : "text-text-secondary"
            }`}
          >
            {summary}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform duration-200 group-open:rotate-180" />
        </span>
      </summary>

      <div className="border-t border-border-subtle bg-bg-primary/60 px-3 py-2.5">
        {children}
      </div>
    </details>
  );
}
