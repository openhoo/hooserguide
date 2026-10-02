# Changelog

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
