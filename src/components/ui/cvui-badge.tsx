import React from "react";
import { cn } from "@/lib/utils";
import { X, Loader2 } from "lucide-react";

/**
 * The badge for the whole site.
 *
 * API is the supplied component's, unchanged. Adaptations:
 *
 * 1. Palette — the original hardcoded `#11111198` greys would read as foreign
 *    against PAPOT's blue/orange/cream, so variants resolve to project tokens.
 * 2. Motion is CSS, not framer-motion. The library cost 39 kB gzipped for an
 *    entrance and a hover tint; keyframes plus a Tailwind hover class give the
 *    same result for nothing, and animate only composited properties so a list
 *    of badges never triggers layout. `prefers-reduced-motion` is honoured in
 *    index.css, and the entrance carries no fill-mode, so a badge stays
 *    visible even if its animation never runs.
 * 3. `animate` — the entrance is pleasant on a single badge and becomes noise
 *    when twenty appear at once, so dense lists opt out.
 */
type BadgeProps = {
  label: string;
  variant?: "primary" | "secondary" | "success" | "warning" | "error" | "info";
  size?: "small" | "medium" | "large";
  icon?: React.ReactNode;
  onClick?: () => void;
  removable?: boolean;
  className?: string;
  maxWidth?: string | number;
  appearance?: "solid" | "outline" | "subtle";
  onRemove?: () => void;
  isLoading?: boolean;
  /** Set false in dense lists to skip the entrance animation. */
  animate?: boolean;
  title?: string;
};

const VARIANTS = {
  primary: {
    solid: "bg-[#002089] text-white",
    outline: "border-2 border-[#002089] text-[#002089]",
    subtle: "bg-[#EAF8FF] text-[#002089]",
  },
  secondary: {
    solid: "bg-[#3E2C23] text-white",
    outline: "border-2 border-[#e2d5c3] text-[#7a6355]",
    subtle: "bg-[#F5E9D8] text-[#7a6355]",
  },
  success: {
    solid: "bg-[#15803d] text-white",
    outline: "border-2 border-[#15803d] text-[#15803d]",
    subtle: "bg-green-50 text-[#15803d]",
  },
  warning: {
    solid: "bg-amber-500 text-white",
    outline: "border-2 border-amber-500 text-amber-700",
    subtle: "bg-amber-50 text-amber-700",
  },
  error: {
    solid: "bg-[#b3261e] text-white",
    outline: "border-2 border-[#b3261e] text-[#b3261e]",
    subtle: "bg-red-50 text-[#b3261e]",
  },
  info: {
    solid: "bg-[#e76f2e] text-white",
    outline: "border-2 border-[#e76f2e] text-[#e76f2e]",
    subtle: "bg-[#FDEBE0] text-[#c9561c]",
  },
} as const;

/** Hover tint per variant, so a solid badge darkens rather than turning grey. */
const HOVER = {
  primary: { solid: "hover:bg-[#001b6e]", outline: "hover:bg-[#EAF8FF]", subtle: "hover:bg-[#d8f0fb]" },
  secondary: { solid: "hover:bg-[#2e1f18]", outline: "hover:bg-[#F5E9D8]", subtle: "hover:bg-[#eeddc6]" },
  success: { solid: "hover:bg-[#126c34]", outline: "hover:bg-green-50", subtle: "hover:bg-green-100" },
  warning: { solid: "hover:bg-amber-600", outline: "hover:bg-amber-50", subtle: "hover:bg-amber-100" },
  error: { solid: "hover:bg-[#961f19]", outline: "hover:bg-red-50", subtle: "hover:bg-red-100" },
  info: { solid: "hover:bg-[#d05e20]", outline: "hover:bg-[#FDEBE0]", subtle: "hover:bg-[#fbdcca]" },
} as const;

const SIZES = {
  small: "text-[11px] px-2 py-1 gap-1.5",
  medium: "text-xs px-2.5 py-1 gap-1.5",
  large: "text-sm px-3.5 py-2 gap-2",
} as const;

export const Badge = ({
  label,
  variant = "primary",
  size = "medium",
  icon,
  onClick,
  removable = false,
  className,
  maxWidth,
  appearance = "solid",
  onRemove,
  isLoading = false,
  animate = true,
  title,
}: BadgeProps) => {
  const interactive = !!onClick;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.();
  };

  return (
    <div
      onClick={interactive ? handleClick : undefined}
      style={{ maxWidth }}
      title={title}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "inline-flex items-center rounded-xl align-middle font-semibold shadow-sm",
        VARIANTS[variant][appearance],
        SIZES[size],
        animate && "papot-badge-in",
        interactive && [
          "cursor-pointer transition-[background-color,transform] duration-200 ease-out",
          "hover:scale-[1.04]",
          HOVER[variant][appearance],
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ad7fb] focus-visible:ring-offset-1",
        ],
        className,
      )}
    >
      {isLoading ? (
        <span className="papot-spin flex shrink-0">
          <Loader2 className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : (
        icon && <span className="flex shrink-0 items-center">{icon}</span>
      )}

      <span className="truncate">{label}</span>

      {removable && (
        <button
          type="button"
          aria-label={`Retirer ${label}`}
          onClick={handleRemove}
          className={cn(
            "-mr-0.5 ml-0.5 flex shrink-0 items-center justify-center rounded-full p-0.5 opacity-70",
            "transition-[opacity,transform] duration-150 ease-out hover:scale-110 hover:opacity-100",
            appearance === "solid" ? "hover:bg-white/20" : "hover:bg-black/5",
          )}
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
  );
};
