import type { Branding } from './types.js';

export const manualThemeNames = [
  'professional',
  'ocean',
  'forest',
  'sand',
  'midnight',
  'graphite',
] as const;
export type ManualThemeName = (typeof manualThemeNames)[number];

/** Shared semantic palette for HTML and PDF. Screenshots retain their original colors. */
export interface ManualTheme {
  name: ManualThemeName;
  label: string;
  colorScheme: 'light' | 'dark';
  colors: {
    foreground: string;
    mutedForeground: string;
    background: string;
    surface: string;
    muted: string;
    primary: string;
    /** Readable accent text; the requested brand color remains in primary. */
    accentForeground: string;
    controlBorder: string;
    focus: string;
    border: string;
    hero: string;
    heroForeground: string;
    heroMuted: string;
    warning: string;
    warningBackground: string;
    tipBackground: string;
  };
}

function preset(
  name: ManualThemeName,
  label: string,
  colorScheme: 'light' | 'dark',
  foreground: string,
  mutedForeground: string,
  background: string,
  surface: string,
  muted: string,
  primary: string,
  border: string,
  hero: string,
): ManualTheme {
  const dark = colorScheme === 'dark';
  return {
    name,
    label,
    colorScheme,
    colors: {
      foreground,
      mutedForeground,
      background,
      surface,
      muted,
      primary,
      accentForeground: primary,
      controlBorder: mutedForeground,
      focus: primary,
      border,
      hero,
      heroForeground: '#ffffff',
      heroMuted: '#d6e3ed',
      warning: dark ? '#fbbf24' : '#92400e',
      warningBackground: dark ? '#382a18' : '#fffbeb',
      tipBackground: dark ? muted : '#ecfdf5',
    },
  };
}

export const manualThemes: Readonly<Record<ManualThemeName, ManualTheme>> = {
  professional: preset(
    'professional',
    'Professional',
    'light',
    '#142636',
    '#52667a',
    '#f5f8fa',
    '#ffffff',
    '#ecf5f3',
    '#075e59',
    '#dce5e9',
    '#142636',
  ),
  ocean: preset(
    'ocean',
    'Ocean',
    'light',
    '#172d46',
    '#50647c',
    '#eef5fc',
    '#ffffff',
    '#e3eefb',
    '#1859a6',
    '#cbdbee',
    '#12365b',
  ),
  forest: preset(
    'forest',
    'Forest',
    'light',
    '#21382a',
    '#506957',
    '#f1f6ef',
    '#ffffff',
    '#e4eee1',
    '#27623c',
    '#d2dfce',
    '#203f2b',
  ),
  sand: preset(
    'sand',
    'Sand',
    'light',
    '#3f3025',
    '#75604f',
    '#faf6ef',
    '#fffdf8',
    '#f1e8da',
    '#8a4920',
    '#e5d8c6',
    '#493526',
  ),
  midnight: preset(
    'midnight',
    'Midnight',
    'dark',
    '#e6edf7',
    '#afbdd0',
    '#0d1526',
    '#152238',
    '#20324d',
    '#80c7ff',
    '#3b506c',
    '#1d3554',
  ),
  graphite: preset(
    'graphite',
    'Graphite',
    'dark',
    '#f0f1f3',
    '#b9bdc6',
    '#17181c',
    '#23252b',
    '#30343d',
    '#b6a4ff',
    '#4b505d',
    '#353044',
  ),
};

/** WCAG relative luminance contrast for validated six-digit sRGB colors. */
function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const values = hex
      .slice(1)
      .match(/../g)!
      .map((part) => {
        const value = parseInt(part, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
    return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function resolveManualTheme(
  name: ManualThemeName = 'professional',
  branding: Branding = {},
): ManualTheme {
  if (!Object.hasOwn(manualThemes, name)) throw new Error(`Unknown manual theme: ${name}`);
  const theme = manualThemes[name];
  const colors = { ...theme.colors };
  if (branding.accentColor) {
    if (!/^#[0-9a-f]{6}$/i.test(branding.accentColor))
      throw new Error('Brand accent must be a six-digit hex color');
    colors.primary = branding.accentColor;
    // Keep brand decoration exact, but never use an unreadable accent as text.
    const surfaces = [
      colors.background,
      colors.surface,
      colors.muted,
      colors.tipBackground,
      colors.warningBackground,
    ];
    colors.accentForeground = surfaces.every((bg) => contrastRatio(colors.primary, bg) >= 4.5)
      ? colors.primary
      : theme.colors.accentForeground;
  }
  return { ...theme, colors };
}

export function themeVariables(theme: ManualTheme): string {
  const c = theme.colors;
  return `color-scheme:${theme.colorScheme};--ink:${c.foreground};--muted:${c.mutedForeground};--accent:${c.primary};--accent-ink:${c.accentForeground};--control-line:${c.controlBorder};--focus:${c.focus};--line:${c.border};--page:${c.background};--surface:${c.surface};--soft:${c.muted};--hero:${c.hero};--hero-ink:${c.heroForeground};--hero-muted:${c.heroMuted};--warning:${c.warning};--warning-bg:${c.warningBackground};--tip-bg:${c.tipBackground}`;
}
