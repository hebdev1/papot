import { Link } from "react-router-dom";

/**
 * Canvas 2a–2e: blue panel with the logo and a Haitian destination photo on the
 * left, form on cream to the right. Replaces 1g's equal-column layout.
 */
export function AuthLayout({
  title,
  subtitle,
  photo,
  pitch,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  /** Destination named on each artboard: 2a Île-à-Vache, 2b Cap-Haïtien, … */
  photo: string;
  /** Blue-panel copy. Defaults to 2a's; 2b overrides it with its own pitch. */
  pitch?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#EFE5D6] flex items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-4xl bg-[#F5E9D8] rounded-2xl overflow-hidden shadow-[0_10px_28px_rgba(62,44,35,.16)] flex flex-col md:flex-row">
        <aside className="md:w-[346px] shrink-0 bg-[#002089] flex flex-col">
          <div className="px-7 pt-7 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[10px] bg-[#e76f2e] flex items-center justify-center">
              <span className="font-display font-black text-white text-[15px] leading-none">P</span>
            </div>
            <Link to="/" className="font-display font-extrabold text-xl text-white tracking-tight">
              PAPOT
            </Link>
          </div>

          <div className="flex-1 mt-6 bg-[#EAF8FF] min-h-[140px] flex items-center justify-center text-center px-5 text-[12.5px] text-[#00508a]">
            photo — {photo}
            <br />à fournir
          </div>

          <div className="px-7 py-7 flex flex-col gap-2">
            {pitch ?? (
              <>
                <span className="font-display font-extrabold text-xl leading-[1.25] text-white tracking-tight">
                  Un compte, tout Haïti
                </span>
                <span className="text-[13.5px] leading-relaxed text-[#a8d8f0]">
                  Hébergements, voitures et tables — vos réservations au même endroit.
                </span>
              </>
            )}
          </div>
        </aside>

        <div className="flex-1 p-8 lg:p-10 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[28px] font-extrabold text-[#002089] tracking-[-0.02em] leading-tight">
              {title}
            </h1>
            <span className="text-sm text-[#7a6355]">{subtitle}</span>
          </div>
          {children}
          {footer}
        </div>
      </div>
    </div>
  );
}

export const fieldLabel = "text-[12.5px] font-semibold text-[#3E2C23]";
export const fieldInput =
  "w-full p-3.5 rounded-xl border-2 border-[#e2d5c3] focus:border-[#6ad7fb] focus:shadow-[0_0_0_3px_rgba(106,215,251,.25)] bg-white text-sm text-[#002089] placeholder:text-[#b0a090] outline-none transition-all";
export const primaryBtn =
  "p-3.5 rounded-xl bg-[#e76f2e] hover:bg-[#d05e20] disabled:opacity-50 disabled:cursor-not-allowed text-white font-display font-bold text-[15px] text-center shadow-[0_6px_18px_rgba(231,111,46,.3)] transition-colors";
export const ghostBtn =
  "p-3.5 rounded-xl border-2 border-[#002089] text-[#002089] font-display font-semibold text-sm text-center bg-white hover:bg-[#002089] hover:text-white transition-colors";

/** The design has no error component; this is the one concession, kept minimal. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="text-[13px] text-[#b3261e] bg-[#fdecea] border border-[#f5c2bd] rounded-xl px-3.5 py-2.5">
      {message}
    </p>
  );
}
