import type { Page, Locator } from '@playwright/test';
import type { PickleStep } from '@cucumber/messages';

export type Target =
  | string
  | { css: string }
  | { role: Parameters<Page['getByRole']>[0]; name: string }
  | { label: string }
  | { text: string }
  | { testId: string };
export interface Mark {
  target: Target;
  kind?: 'box' | 'arrow' | 'both';
  label?: string;
  caption?: string;
  color?: string;
  /** Arrow origin in screenshot CSS pixels. Default: automatically placed. */
  from?: { x: number; y: number };
}
export interface CaptureSpec {
  title: string;
  description?: string;
  fullPage?: boolean;
  /** Crop to this element with padding; incompatible with fullPage. */
  focus?: Target;
  padding?: number;
  autoLabels?: 'numbers' | 'letters';
  marks?: Mark[];
  masks?: Target[];
}
export interface BrowserProfile {
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
  browser?: 'chromium' | 'firefox' | 'webkit';
  isMobile?: boolean;
  hasTouch?: boolean;
  colorScheme?: 'light' | 'dark' | 'no-preference';
}
export interface Branding {
  name?: string;
  subtitle?: string;
  accentColor?: string;
}
export interface Config {
  $schema?: string;
  title: string;
  baseURL: string;
  features: string[];
  output: string;
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
  browser?: 'chromium' | 'firefox' | 'webkit';
  headed?: boolean;
  storageState?: string;
  timeoutMs?: number;
  /** Modules export register(registry). Loaded only from trusted local config. */
  plugins?: string[];
  masks?: Target[];
  tag?: string;
  language?: string;
  pdf?: boolean;
  profiles?: Record<string, BrowserProfile>;
  profile?: string;
  branding?: Branding;
}
export interface ResolvedMark extends Mark {
  bounds: { x: number; y: number; width: number; height: number };
}
export interface Capture {
  id: string;
  title: string;
  description?: string;
  image: string;
  raw: string;
  width: number;
  height: number;
  sha256: string;
  rawSha256?: string;
  marks: ResolvedMark[];
  crop?: { x: number; y: number; width: number; height: number };
}
export interface Chapter {
  title: string;
  feature: string;
  source: string;
  tags: string[];
  description: string;
  status: 'passed' | 'failed';
  instructions: string[];
  captures: Capture[];
  steps: { text: string; status: 'passed' | 'failed'; error?: string; durationMs?: number }[];
  error?: string;
}
export interface RunReport {
  schemaVersion: 1;
  title: string;
  generatedAt: string;
  language: string;
  status: 'passed' | 'failed';
  browser: string;
  chapters: Chapter[];
  exportError?: string;
  profile?: string;
  branding?: Branding;
  viewport?: { width: number; height: number };
  rebuiltAt?: string;
  sourceReportSha256?: string;
}
export interface StepContext {
  page: Page;
  chapter: Chapter;
  step: PickleStep;
  config: Config;
  target(value: Target): Locator;
  capture(spec: CaptureSpec): Promise<Capture>;
  instruction(text: string): void;
}
export type StepHandler = (context: StepContext, ...matches: string[]) => Promise<void> | void;
export interface StepDocumentation {
  example: string;
  description: string;
}
export interface RunResult {
  report: RunReport;
  directory: string;
  artifacts: { report: string; html?: string; markdown?: string; pdf?: string };
}
