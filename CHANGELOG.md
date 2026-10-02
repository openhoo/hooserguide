# Changelog

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
