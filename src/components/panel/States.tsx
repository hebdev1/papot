import { Link } from "react-router-dom";
import { AlertCircle, RefreshCw } from "lucide-react";

/** Empty, error and loading states (spec §33–35). Never a blank screen. */

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="rounded-2xl border border-[#e2d5c3] bg-white px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E9F9FE] text-[#7a6355]">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <p className="font-display text-lg font-bold text-[#3E2C23]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-[#7a6355]">{body}</p>
      {action && (
        <Link
          to={action.to}
          className="mt-5 inline-block rounded-xl bg-[#e76f2e] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#d05e20]"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Plain language, no error codes as the primary message (spec §34, §41). */
export function ErrorState({ title, onRetry }: { title: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#b3261e]">
        <AlertCircle className="h-6 w-6" aria-hidden />
      </div>
      <p className="font-display text-base font-bold text-[#3E2C23]">{title}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border-2 border-[#002089] bg-white px-4 py-2.5 text-sm font-semibold text-[#002089] transition-colors hover:bg-[#002089] hover:text-white"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Réessayer
        </button>
      )}
    </div>
  );
}

/** Skeletons, not full-page spinners (spec §35). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[#e2d5c3]/60 ${className}`} />;
}

export function BookingCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#e2d5c3] bg-white p-4 sm:flex-row">
      <Skeleton className="h-32 w-full shrink-0 sm:h-28 sm:w-40" />
      <div className="flex-1 space-y-2.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
    </div>
  );
}
