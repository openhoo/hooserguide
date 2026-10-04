export { run, validate, loadRegistry, type RunResult, type RunOptions } from './runner.js';
export { loadConfig, defineConfig, resolveConfig, selectProfile } from './config.js';
export { build, type BuildOptions } from './build.js';
export { captureScreenshot, overlay, assignLabels } from './capture.js';
export { StepRegistry, builtinSteps, target } from './steps.js';
export { renderManual } from './render.js';
export { renderPdf } from './pdf.js';
export type * from './types.js';

export { compareRuns } from './compare.js';
export { bundle } from './bundle.js';
export { inspectRun } from './evidence.js';

export { preparePages, type PagesOptions } from './pages.js';

export { manualThemes, manualThemeNames, resolveManualTheme } from './themes.js';
export type { ManualTheme, ManualThemeName } from './themes.js';
export { lint, formatDiagnostics, formatOutline, suggestSteps } from './authoring.js';
export type { AuthoringReport, AuthoringDiagnostic } from './authoring.js';
export {
  newChapter,
  chapterTemplate,
  chapterTemplates,
  setupEditor,
} from './authoring-scaffold.js';
export type { ChapterTemplate } from './authoring-scaffold.js';
