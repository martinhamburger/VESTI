import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

interface InsightsAccordionItemProps {
  title: string;
  description: string;
  icon: ReactNode;
  open?: boolean;
  disabled?: boolean;
  soonTag?: string;
  onToggle?: () => void;
  children?: ReactNode;
}

export function InsightsAccordionItem({
  title,
  description,
  icon,
  open = false,
  disabled = false,
  soonTag,
  onToggle,
  children,
}: InsightsAccordionItemProps) {
  const shellClass = [
    "ins-acc-item",
    open ? "ins-acc-item-open" : "ins-acc-item-closed",
    disabled ? "ins-acc-item-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      <button
        type="button"
        onClick={disabled ? undefined : onToggle}
        className="ins-acc-trigger"
        aria-expanded={disabled ? undefined : open}
        aria-disabled={disabled || undefined}
      >
        <span className="ins-acc-icon">{icon}</span>
        <span className="ins-acc-text">
          <span className="ins-acc-name">{title}</span>
          <span className="ins-acc-desc" title={description}>
            {description}
          </span>
        </span>

        {soonTag ? (
          <span className="ins-soon-tag">{soonTag}</span>
        ) : (
          <ChevronDown className="ins-acc-chevron h-4 w-4" strokeWidth={1.8} />
        )}
      </button>

      {!disabled && open && children ? (
        <div className="ins-acc-body">{children}</div>
      ) : null}
    </div>
  );
}
