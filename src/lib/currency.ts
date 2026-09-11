import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Canvas spec: "prix en USD avec équivalent HTG."
 * USD is canonical; HTG is derived from a single rate so every figure on the
 * site stays internally consistent.
 */
export const FALLBACK_USD_HTG = 131;

export function formatUsd(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const whole = Number.isInteger(rounded);
  return `${rounded.toLocaleString("fr-FR", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })} $`;
}

export function formatHtg(usd: number, rate: number): string {
  return `${Math.round(usd * rate).toLocaleString("fr-FR")} HTG`;
}

export function useUsdHtgRate(): number {
  const [rate, setRate] = useState(FALLBACK_USD_HTG);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("exchange_rates")
      .select("rate")
      .eq("base", "USD")
      .eq("quote", "HTG")
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load exchange rate:", error);
        else if (data) setRate(Number(data.rate));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return rate;
}
