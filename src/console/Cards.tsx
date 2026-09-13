import { Link } from "react-router-dom";
import { ArrowRight, HelpCircle, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "../lib/utils";
import { Sparkline } from "./Charts";
import { SEVERITY } from "./StatusBadge";
import { Skeleton } from "./Ui";

/** KPI card (spec §4): value, change, comparison, trend, tooltip. */
export function MetricCard({
  label,
  value,
  changePct,
  comparison = "vs 30 jours précédents",
  trend,
  tone = "blue",
  tooltip,
  to,
  loading,
}: {
  label: string;
  value: string;
  changePct?: number | null;
  comparison?: string;
  trend?: number[];
  tone?: "blue" | "orange" | "green" | "red";
  tooltip?: string;
  to?: string;
  loading?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1 text-[12.5px] font-medium text-admin-ink-2">
          {label}
          {tooltip && (
            <span title={tooltip} className="cursor-help text-admin-ink-3">
              <HelpCircle className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">{tooltip}</span>
            </span>
          )}
        </p>
        {to && (
          <ArrowRight
            className="h-3.5 w-3.5 shrink-0 text-admin-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        )}
      </div>

      {loading ? (
        <Skeleton className="mt-2 h-8 w-28" />
      ) : (
        <p className="mt-1.5 font-display text-[26px] font-semibold leading-none tracking-tight text-admin-ink">
          {value}
        </p>
      )}

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-4 w-24" />
          ) : changePct === null || changePct === undefined ? (
            <p className="flex items-center gap-1 text-[12px] text-admin-ink-3">
              <Minus className="h-3.5 w-3.5" aria-hidden />
              Pas de comparaison
            </p>
          ) : (
            <p
              className={cn(
                "flex items-center gap-1 text-[12.5px] font-semibold",
                changePct > 0 ? "text-[#15803d]" : changePct < 0 ? "text-[#b3261e]" : "text-admin-ink-3",
              )}
            >
              {changePct > 0 ? (
                <TrendingUp className="h-3.5 w-3.5" aria-hidden />
              ) : changePct < 0 ? (
                <TrendingDown className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Minus className="h-3.5 w-3.5" aria-hidden />
              )}
              {changePct > 0 ? "+" : ""}
              {changePct.toFixed(1).replace(".", ",")} %
            </p>
          )}
          <p className="mt-0.5 truncate text-[11.5px] text-admin-ink-3">{comparison}</p>
        </div>

        {trend && trend.length > 1 && (
          <div className="w-24 shrink-0">
            <Sparkline values={trend} tone={tone} />
          </div>
        )}
      </div>
    </>
  );

  const classes =
    "group rounded-xl border border-admin-line bg-admin-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow";

  return to ? (
    <Link to={to} className={cn(classes, "hover:shadow-md")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/**
 * Platform health (spec §5). Severity is the point of this card: an operator
 * scanning the row should see what is on fire before they read a single label.
 */
export function HealthCard({
  label,
  value,
  severity,
  to,
  hint,
  loading,
}: {
  label: string;
  value: number;
  severity: "normal" | "attention" | "urgent" | "critical";
  to: string;
  hint?: string;
  loading?: boolean;
}) {
  const s = SEVERITY[severity];
  const quiet = value === 0;

  return (
    <Link
      to={to}
      className={cn(
        "group flex items-center gap-3 rounded-xl border bg-admin-surface p-3.5 transition-shadow hover:shadow-md",
        quiet ? "border-admin-line" : s.ring,
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-content-center rounded-lg font-display text-[15px] font-bold tabular-nums",
          quiet ? "bg-admin-canvas text-admin-ink-3" : `${s.text} bg-current/10`,
        )}
      >
        {loading ? "·" : value}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-admin-ink">{label}</span>
        <span className="block truncate text-[11.5px] text-admin-ink-3">
          {quiet ? "Rien à traiter" : (hint ?? s.label)}
        </span>
      </span>
      {!quiet && <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} aria-hidden />}
    </Link>
  );
}

/** Alert row in the alert centre (spec §67). */
export function AlertCard({
  count,
  label,
  severity,
  to,
  actions,
}: {
  count: number;
  label: string;
  severity: "normal" | "attention" | "urgent" | "critical";
  to: string;
  actions?: React.ReactNode;
}) {
  const s = SEVERITY[severity];
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-lg border bg-admin-surface px-4 py-3", s.ring)}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} aria-hidden />
      <Link to={to} className="min-w-0 flex-1 text-[13.5px] text-admin-ink hover:text-[#002089]">
        <strong className="font-semibold">{count}</strong> {label}
      </Link>
      {actions}
    </div>
  );
}

/** A compact statistic inside a detail page summary. */
export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-admin-line bg-admin-raised px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-admin-ink-3">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-[19px] font-semibold tabular-nums leading-none",
          tone === "positive" ? "text-[#15803d]" : tone === "negative" ? "text-[#b3261e]" : "text-admin-ink",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11.5px] text-admin-ink-3">{hint}</p>}
    </div>
  );
}
