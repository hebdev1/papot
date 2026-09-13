import { Link } from "react-router-dom";
import { AlertCircle, ChevronRight, Info, RefreshCw } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";

/**
 * The shared surfaces of the console. Everything here is deliberately plain:
 * subtle elevation, one border colour, generous but not wasteful spacing, so
 * dense tables stay readable for hours (spec §74).
 */

export function Card({
  className,
  children,
  padded = true,
}: {
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-admin-line bg-admin-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-4 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-semibold leading-tight text-admin-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-admin-ink-3">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/** Page title row (spec §75: 28–32px semibold). */
export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumb?: { label: string; to?: string }[];
}) {
  return (
    <header className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="mb-2 flex flex-wrap items-center gap-1 text-[12.5px] text-admin-ink-3">
          {breadcrumb.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
              {c.to ? (
                <Link to={c.to} className="transition-colors hover:text-[#002089]">
                  {c.label}
                </Link>
              ) : (
                <span className="text-admin-ink-2">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-admin-ink lg:text-[30px]">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-[14px] leading-relaxed text-admin-ink-2">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ad7fb] " +
  "focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-55";

const VARIANTS = {
  primary: "bg-[#002089] text-white hover:bg-[#001b6e]",
  accent: "bg-[#e76f2e] text-white hover:bg-[#d05e20]",
  secondary: "border border-admin-line-strong bg-white text-admin-ink hover:bg-admin-canvas",
  ghost: "text-admin-ink-2 hover:bg-admin-canvas hover:text-admin-ink",
  danger: "bg-[#b3261e] text-white hover:bg-[#961f19]",
  dangerGhost: "border border-[#f0cfcd] bg-white text-[#b3261e] hover:bg-[#fdf3f2]",
} as const;

const SIZES = { sm: "h-8 px-2.5", md: "h-9 px-3.5", lg: "h-11 px-5 text-sm" } as const;

export function Button({
  variant = "secondary",
  size = "md",
  className,
  as,
  to,
  ...props
}: {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  className?: string;
  as?: "button" | "link";
  to?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = cn(BUTTON_BASE, VARIANTS[variant], SIZES[size], className);
  if (as === "link" && to) {
    return (
      <Link to={to} className={classes}>
        {props.children}
      </Link>
    );
  }
  return <button type="button" className={classes} {...props} />;
}

/** Scrollable tab strip; wraps on desktop, scrolls on mobile (spec §64). */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  counts,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map(t => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors",
              on
                ? "bg-[#002089] text-white"
                : "text-admin-ink-2 hover:bg-admin-canvas hover:text-admin-ink",
            )}
          >
            {t.label}
            {counts?.[t.id] !== undefined && (
              <span
                className={cn(
                  "ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold",
                  on ? "bg-white/20" : "bg-admin-canvas text-admin-ink-3",
                )}
              >
                {counts[t.id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Label/value pair used across every detail page. */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">{label}</dt>
      <dd className="mt-1 text-[13.5px] font-medium text-admin-ink">{children ?? "—"}</dd>
    </div>
  );
}

export function FieldGrid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "sm:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {children}
    </dl>
  );
}

/** Spec §69. An empty state says what would appear here, and what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ElementType;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-admin-line-strong bg-admin-raised px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-admin-canvas text-admin-ink-3">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <p className="font-display text-[15px] font-semibold text-admin-ink">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-admin-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Spec §70. Operators get a plain sentence; the technical detail is one click
 * away, because an admin debugging a broken screen does need it.
 */
export function ErrorState({
  title = "Nous n'avons pas pu charger ces données.",
  detail,
  onRetry,
}: {
  title?: string;
  detail?: string | null;
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[#f0cfcd] bg-[#fdf3f2] px-6 py-8 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#b3261e]">
        <AlertCircle className="h-5 w-5" aria-hidden />
      </div>
      <p className="font-display text-[15px] font-semibold text-admin-ink">{title}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Réessayer
          </Button>
        )}
        {detail && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)}>
            {open ? "Masquer" : "Voir le détail technique"}
          </Button>
        )}
      </div>
      {open && detail && (
        <pre className="mt-3 overflow-x-auto rounded-lg bg-white px-3 py-2 text-left text-[12px] text-admin-ink-2">
          {detail}
        </pre>
      )}
    </div>
  );
}

/** Spec §71: skeletons, never a full-page spinner. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-admin-line/70", className)} />;
}

export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-admin-line">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-4", c === 0 ? "w-1/4" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A short explanatory note inside a page, not an error. */
export function Callout({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed",
        tone === "info"
          ? "border-[#dbe4f3] bg-[#f4f8fd] text-[#1e3a6b]"
          : "border-[#f3e2c4] bg-[#fdf8ee] text-[#7a5b12]",
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Text input shared by every filter bar and form in the console. */
export const inputClass =
  "h-9 w-full rounded-lg border border-admin-line-strong bg-white px-3 text-[13px] text-admin-ink " +
  "placeholder:text-admin-ink-3 focus:border-[#002089] focus:outline-none focus:ring-2 focus:ring-[#6ad7fb]/40";

export const selectClass = inputClass + " pr-8 cursor-pointer";

export const labelClass = "mb-1.5 block text-[12px] font-semibold text-admin-ink-2";
