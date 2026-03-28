import type { KeyboardEventHandler } from "react";
import { SearchLineIcon } from "./ThreadSearchIcons";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  ariaLabel?: string;
  className?: string;
  variant?: "default" | "threads-glass";
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search conversations",
  autoFocus = false,
  onKeyDown,
  ariaLabel,
  className,
  variant = "default",
}: SearchInputProps) {
  const isEmpty = value.trim().length === 0;
  const rootClassName = [
    "vesti-search-input",
    variant === "threads-glass" ? "vesti-search-input-glass" : "vesti-search-input-default",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName} data-empty={isEmpty ? "true" : "false"}>
      <SearchLineIcon className="vesti-search-input-icon" />
      {variant === "threads-glass" ? (
        <span className="vesti-search-input-placeholder" aria-hidden="true">
          {placeholder}
        </span>
      ) : null}
      <input
        type="text"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel ?? placeholder}
        placeholder={variant === "threads-glass" ? "" : placeholder}
        className="vesti-search-input-field"
      />
    </div>
  );
}
