# Changelog

## 0.8.3 — 2026-10-07

- Reject ignored built-in step arguments, malformed URLs, impossible counts and empty CLI profile selections before application actions; retain lint diagnostics for malformed capture descriptions.
- Keep environment-fill failures free of browser logs that can expose encoded or abbreviated secret values.
- Handle CLI interruption through cancellation signals, close browsers and retain failed evidence without publishing successful manuals.
- Regenerate portable bundle manuals from verified screenshots and sanitized reports instead of trusting existing exports.
- Check canonical Pages output separation before creating directories, including nested paths through source symlink aliases.
- Validate direct comparisons and crop dimensions, enforce limits during artifact reads and bind provenance hashes to the parsed report snapshot.
- Tag PDF headings semantically and provide screenshot alternative text, screen labels and continuation parts while preserving visual layout.
- Keep long desktop contents scrollable and prepare offscreen screenshots for native browser printing.
- Align documentation and consumer skills; add 14 regression tests and refresh the published examples.

## 0.8.2 — 2026-10-04

- Make the handbook header compact on desktop and mobile with smaller titles, reduced padding and concise metadata; tighten reader controls so content starts sooner.
- Reduce PDF cover title size and top spacing.
- Make PDF contents entries clickable with internal chapter destinations and reader bookmarks that resolve after pagination, including duplicate titles and overflowing content.
- Keep chapter bookmarks when the contents list is disabled and add navigation and header-size regression checks.

## 0.8.1 — 2026-10-04

- Improve control boundaries and keyboard focus contrast in all six HTML themes, including selected buttons and PDF downloads.
- Preserve custom brand accents for decoration while using readable accent text in HTML and PDF when the brand color fails 4.5:1 contrast.
- Keep callout borders visible with custom branding, distinguish warning labels, and improve search placeholders and screenshot-link focus indicators.
- Add semantic and rendered contrast checks across every theme, custom accents, theme switching and emitted PDF text colors.

## 0.7.1 — 2026-10-04

- Place the HTML theme selector above the handbook title so readers can change the theme immediately.
- Add a prominent PDF download button next to the theme selector, with localized labels and a real file download. Keep PDF downloads available without JavaScript and omit them when no PDF was generated.
- Verify persisted theme changes and actual PDF download bytes across Chromium, Firefox and WebKit.

## 0.7.0 — 2026-10-03

- Offer six shared HTML/PDF manual themes, including Midnight and Graphite dark themes, through `manual.theme` and `run/build --theme`.
- Add an accessible offline HTML theme selector with per-handbook storage and a light print palette.

## 0.3.0 — 2026-10-02

- Select workflows with official Cucumber tag expressions and case-insensitive scenario-name filters; retain actual selection in reports.
- Stop optionally after the first failed scenario and record unstarted scenarios explicitly, including cancellation skips.
- Add prerequisites plus note, tip and warning BDD steps, rendered with escaped prose in HTML, Markdown and PDF.
- Add guide/product versions, audience and summary; localize guide controls and PDF labels/page numbers into German or English.
- Configure A4/Letter PDFs, portrait/landscape orientation, margins, table of contents and date visibility; preserve settings during rebuild.
- Apply global capture defaults for references, colors, focused padding and full-page screenshots with local overrides.
- Register fixed PDF footers before content so they survive native overflow pagination.
- Add offline HTML search, original/annotated image switching, keyboard-friendly controls and full-guide printing.
- Add verified local inspection and run comparison via TypeScript, CLI and MCP; distinguish original pixels from annotation-definition changes.
- Package successful manuals as portable ZIPs with masked evidence, sanitized report paths and a SHA-256 file manifest; never overwrite existing bundles.
- Expand MCP to nine tools and read-only project/exact-artifact resources; update both agent skills and their references.
- Add real-browser integration coverage, all four PDF geometries and new screenshot/PDF examples in the README.

## 0.2.2 — 2026-10-02

- Add MCP project status and exact run inspection, seven strict tool contracts and a review prompt.
- Persist run selection across server restarts; pin `runId` for inspection/rebuild and recover successful evidence after newer failures.
- Inspect annotated and masked raw screenshots with hash, PNG dimension, size and path containment checks.
- Add structured domain errors with repair hints, progress notifications, cancellation and serialized generation/rebuild.
- Keep plugin console diagnostics on stderr so stdio protocol messages remain valid.
- Rewrite author/review skills with concise workflows, self-contained references, exact-run review and cancellation guidance.
- Add real stdio regression coverage for restart selection, tampering, symlink escapes, strict schemas, noisy plugins and cancellation cleanup.

## 0.2.1

- Correct mobile screenshot geometry on pages without a viewport meta tag.
- Freeze Web Animations before measuring targets rather than fast-forwarding during capture.
- Avoid reference badge collisions, separate adjacent outlines, fix edge padding and preserve explicit arrow origins.
- Paint automatic numbers for captioned marks without labels; legacy rebuilds no longer invent absent references.
- Improve custom-color reference contrast and prevent narrow-screen overflow with long titles, branding and captions.
- Balance PDF screenshot slices, keep annotation groups together where possible, and show matching legends on each slice.
- Fix off-page rendering of long PDF legends using native inline text runs.
- Reject command-specific flags that were previously ignored; allow profile overrides to replace invalid defaults.
- Preflight init conflicts and URLs before writing project files.
- Publish failed browser-context setup evidence and clean temporary runs on unexpected failures.
- Retain the last successful MCP evidence for rebuilds after a failed generation.
- Add browser, geometry, accessibility and long-document regression tests plus reproducible before/after screenshots.

## 0.2.0 — 2026-10-02

- Focused element screenshots with padding, automatic numeric/alphabetical references and original-image hashes.
- Form data tables, file uploads, drag-and-drop, hover, double-click, clear, reload and history actions.
- Value, checked-state, enabled-state, hidden-state, text-contains, count, attribute, URL and title assertions.
- Named responsive browser profiles and per-step execution duration evidence.
- Evidence-only rebuilds with screenshot hash/dimension verification, report validation and source provenance.
- Configurable HTML/PDF brand name, subtitle and accent color; legends honor per-mark colors.
- CLI step discovery, profile selection and rebuild commands; matching MCP catalogue and rebuild tools.
- Report schema, extended agent skills and additional real browser/security/integration regressions.

## 0.1.0 — 2026-10-02

- Gherkin BDD execution with Playwright, assertions, outlines, backgrounds and custom steps.
- Screenshot boxes, arrows, letter/number references, legends and strict privacy masks.
- Pdfcn / Forme PDF generation, responsive HTML, Markdown and JSON execution evidence.
- CLI initialization, demo, validation, generation and JSON output.
- MCP generation/inspection tools, TypeScript API and two reusable agent skills.
- Real browser, PDF, failure-path and integration tests; documented generated examples.
