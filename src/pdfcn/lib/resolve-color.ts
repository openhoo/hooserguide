// Vendored from pdfcn 39c75c1abbbad7b89ad1d8d3ea740ef635818a4b; MIT. See THIRD_PARTY_NOTICES.md.
import type { ColorTokens } from "../types/pdf-themes.js";

/** Theme color token keys that can be used for the color prop */
export const THEME_COLOR_KEYS = [
  "foreground",
  "background",
  "muted",
  "mutedForeground",
  "primary",
  "primaryForeground",
  "border",
  "accent",
  "destructive",
  "success",
  "warning",
  "info",
] as const satisfies (keyof ColorTokens)[];

/** Resolves a color value: theme token key → hex, or raw CSS color as-is. */
export const resolveColor = (value: string, colors: ColorTokens): string => {
  const key = value as (typeof THEME_COLOR_KEYS)[number];
  return THEME_COLOR_KEYS.includes(key) ? colors[key] : value;
};
