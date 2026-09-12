import React from "react";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { X, Loader2 } from "lucide-react";

/**
 * The badge for the whole site.
 *
 * API is the supplied component's, unchanged. Two adaptations:
 *
 * 1. Palette — the original hardcoded `#11111198` greys, which would read as
 *    foreign against PAPOT's blue/orange/cream. Variants now resolve to the
 *    project's own tokens.
 * 2. `animate` — the entrance animation is lovely on a single badge and
 *    becomes noise when twenty of them blur in at once, so dense lists can
 *    opt out. Reduced-motion preferences are always honoured.
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

const SIZES = {
  small: "text-[11px] px-2 py-1 gap-1.5",
  medium: "text-xs px-2.5 py-1 gap-1.5",
  large: "text-sm px-3.5 py-2 gap-2",
} as const;

/** Hover tint per variant, so solid badges darken rather than turning grey. */
const HOVER_TINT: Record<keyof typeof VARIANTS, string> = {
  primary: "#001b6e",
  secondary: "#2e1f18",
  success: "#126c34",
  warning: "#d97706",
  error: "#961f19",
  info: "#d05e20",
};

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
  const reduceMotion = useReducedMotion();
  const motionOn = animate && !reduceMotion;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.();
  };

  const interactive = !!onClick;

  return (
    <motion.div
      initial={motionOn ? { opacity: 0, scale: 0.95, y: 6 } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      whileHover={
        interactive && !reduceMotion
          ? {
              scale: 1.04,
              backgroundColor: appearance === "solid" ? HOVER_TINT[variant] : undefined,
              transition: { duration: 0.18, ease: "easeOut" },
            }
          : undefined
      }
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
        "inline-flex items-center rounded-xl font-semibold align-middle shadow-sm",
        VARIANTS[variant][appearance],
        SIZES[size],
        interactive &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ad7fb] focus-visible:ring-offset-1",
        className,
      )}
    >
      {isLoading ? (
        <motion.span
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 1, ease: "linear", repeat: Infinity }}
          className="flex shrink-0"
        >
          <Loader2 className="h-3.5 w-3.5" aria-hidden />
        </motion.span>
      ) : (
        icon && <span className="flex shrink-0 items-center">{icon}</span>
      )}

      <span className="truncate">{label}</span>

      {removable && (
        <motion.button
          type="button"
          aria-label={`Retirer ${label}`}
          whileHover={reduceMotion ? undefined : { scale: 1.12 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={cn(
            "-mr-0.5 ml-0.5 flex shrink-0 items-center justify-center rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100",
            appearance === "solid" ? "hover:bg-white/20" : "hover:bg-black/5",
          )}
          onClick={handleRemove}
        >
          <X className="h-3 w-3" aria-hidden />
        </motion.button>
      )}
    </motion.div>
  );
};
