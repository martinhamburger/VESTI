import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface ReaderSidecarDisclosureProps {
  title: string;
  count: number;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  trayVariant?: "default" | "compact";
}

export function ReaderSidecarDisclosure({
  title,
  count,
  icon,
  children,
  defaultOpen = false,
  forceOpen = false,
  trayVariant = "default",
}: ReaderSidecarDisclosureProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const trayWrapClassName =
    trayVariant === "compact"
      ? "reader-sidecar-tray-wrap reader-sidecar-tray-wrap-compact"
      : "reader-sidecar-tray-wrap";
  const trayClassName =
    trayVariant === "compact"
      ? "reader-sidecar-tray reader-sidecar-tray-compact"
      : "reader-sidecar-tray";

  useEffect(() => {
    if (!forceOpen || !detailsRef.current || detailsRef.current.open) {
      return;
    }

    detailsRef.current.open = true;
  }, [forceOpen]);

  return (
    <details
      ref={detailsRef}
      open={defaultOpen || undefined}
      className="reader-sidecar-disclosure group"
    >
      <summary
        className="reader-sidecar-trigger"
        aria-label={`${title} (${count})`}
      >
        <span className="reader-sidecar-trigger-main">
          <span className="reader-sidecar-trigger-icon">{icon}</span>
          <span className="reader-sidecar-trigger-label">{title}</span>
        </span>

        <span className="reader-sidecar-trigger-right">
          <span className="reader-sidecar-trigger-count">{count}</span>
          <ChevronDown className="reader-sidecar-trigger-chevron" strokeWidth={1.75} />
        </span>
      </summary>

      <div className={trayWrapClassName}>
        <div className={trayClassName}>{children}</div>
      </div>
    </details>
  );
}
