import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

const SIZE_CLASS = {
  sm: "size-3.5",
  md: "size-5",
  lg: "size-7",
} as const;

type StarSize = keyof typeof SIZE_CLASS;

/**
 * Read-only star display. Supports fractional fill for averages
 * (e.g. 4.3 renders the fourth star ~30% filled).
 */
export function StarRating({
  value,
  size = "sm",
  className,
}: {
  value: number;
  size?: StarSize;
  className?: string;
}) {
  return (
    <div
      className={cn("inline-flex items-center", className)}
      role="img"
      aria-label={`Rated ${value.toFixed(1)} out of 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className={cn("relative", SIZE_CLASS[size])}>
            <Star
              className={cn(SIZE_CLASS[size], "text-muted-foreground/40")}
              aria-hidden
            />
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star
                  className={cn(
                    SIZE_CLASS[size],
                    "fill-amber-400 text-amber-400"
                  )}
                  aria-hidden
                />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Interactive 1–5 star selector. Reports the chosen value via onChange.
 * Hovering previews the value; defaultValue pre-fills an existing rating.
 */
export function StarRatingInput({
  defaultValue = 0,
  size = "lg",
  disabled = false,
  onChange,
  className,
}: {
  defaultValue?: number;
  size?: StarSize;
  disabled?: boolean;
  onChange?: (value: number) => void;
  className?: string;
}) {
  const [selected, setSelected] = useState(defaultValue);
  const [hovered, setHovered] = useState(0);

  const active = hovered || selected;

  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      onMouseLeave={() => setHovered(0)}
      role="radiogroup"
      aria-label="Your rating"
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const value = i + 1;
        const isActive = value <= active;
        return (
          <button
            key={value}
            type="button"
            disabled={disabled}
            role="radio"
            aria-checked={value === selected}
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            className={cn(
              "rounded-sm outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring",
              !disabled && "hover:scale-110 cursor-pointer",
              disabled && "cursor-not-allowed opacity-60"
            )}
            onMouseEnter={() => !disabled && setHovered(value)}
            onClick={() => {
              if (disabled) return;
              setSelected(value);
              onChange?.(value);
            }}
          >
            <Star
              className={cn(
                SIZE_CLASS[size],
                isActive
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
