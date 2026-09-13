import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button, inputClass, labelClass } from "./Ui";

/**
 * Modals for the console.
 *
 * On mobile these anchor to the bottom as a sheet (spec §64); on desktop they
 * centre. Focus is trapped, Escape closes, and the trigger regains focus on
 * close, because these dialogs guard destructive actions and must not be
 * dismissible by accident or unusable by keyboard.
 */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the panel itself rather than the first control, so a dangerous
    // confirm button is never focused by default.
    panel.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-[#101828]/45 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden bg-white shadow-2xl outline-none",
          "rounded-t-2xl sm:rounded-2xl",
          width === "sm" && "sm:max-w-md",
          width === "md" && "sm:max-w-lg",
          width === "lg" && "sm:max-w-2xl",
          width === "xl" && "sm:max-w-4xl",
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-admin-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-[16px] font-semibold text-admin-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] leading-relaxed text-admin-ink-2">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-admin-ink-3 transition-colors hover:bg-admin-canvas hover:text-admin-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-admin-line bg-admin-raised px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

export type ConfirmSpec = {
  title: string;
  /** What will actually happen. Spec §62: explain the consequence. */
  consequence: string;
  confirmLabel: string;
  danger?: boolean;
  /** Ask for a reason and refuse to submit without one (spec §62). */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonHint?: string;
  /** Extra fields, e.g. the refund amount. */
  extra?: (state: { reason: string }) => React.ReactNode;
  onConfirm: (reason: string) => Promise<string | null> | string | null | void;
};

/**
 * High-impact actions route through here. The reason is enforced client-side
 * for a fast, clear message — and again inside the RPC, which is what actually
 * guarantees the audit row has one.
 */
export function ConfirmDialog({
  spec,
  open,
  onClose,
  onDone,
}: {
  spec: ConfirmSpec | null;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
      setBusy(false);
    }
  }, [open, spec]);

  if (!spec) return null;

  const tooShort = spec.requireReason && reason.trim().length < 5;

  const submit = async () => {
    if (tooShort) {
      setError("Merci d'indiquer un motif d'au moins 5 caractères.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await spec.onConfirm(reason.trim());
    setBusy(false);
    if (typeof result === "string" && result) {
      setError(result);
      return;
    }
    onClose();
    onDone?.();
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={spec.title}
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant={spec.danger ? "danger" : "primary"} onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 papot-spin" aria-hidden />}
            {spec.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed",
            spec.danger
              ? "border-[#f0cfcd] bg-[#fdf3f2] text-[#8a2b24]"
              : "border-[#dbe4f3] bg-[#f4f8fd] text-[#1e3a6b]",
          )}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{spec.consequence}</p>
        </div>

        {spec.extra?.({ reason })}

        {spec.requireReason && (
          <div>
            <label className={labelClass} htmlFor="confirm-reason">
              {spec.reasonLabel ?? "Motif"} <span className="text-[#b3261e]">*</span>
            </label>
            <textarea
              id="confirm-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder={spec.reasonHint ?? "Cette explication est conservée dans le journal d'audit."}
              className={cn(inputClass, "h-auto py-2 leading-relaxed")}
            />
            <p className="mt-1 text-[12px] text-admin-ink-3">
              Enregistré dans le journal d'audit avec votre nom et l'heure.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-[#fdf3f2] px-3 py-2 text-[13px] font-medium text-[#b3261e]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Right-hand drawer for quick inspection without losing the list (spec §72). */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div className="absolute inset-0 bg-[#101828]/35" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-admin-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-[16px] font-semibold text-admin-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[13px] text-admin-ink-3">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-1 rounded-lg p-1.5 text-admin-ink-3 hover:bg-admin-canvas hover:text-admin-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-admin-line bg-admin-raised px-5 py-3.5">
            {footer}
          </footer>
        )}
      </aside>
    </div>,
    document.body,
  );
}

/** Hook that wires a confirm dialog into a page with one call site. */
export function useConfirm() {
  const [spec, setSpec] = useState<ConfirmSpec | null>(null);
  const [open, setOpen] = useState(false);

  return {
    confirm: (s: ConfirmSpec) => {
      setSpec(s);
      setOpen(true);
    },
    dialogProps: { spec, open, onClose: () => setOpen(false) },
  };
}
