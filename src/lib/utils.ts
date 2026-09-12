import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Standard shadcn helper. twMerge resolves Tailwind conflicts so a caller's
 * `className` can override a component's defaults rather than fighting them.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
