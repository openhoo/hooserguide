# Architecture

```text
Agent + browser inspection
          │ writes
          ▼
Gherkin features + local config + optional domain steps
          │
          ▼
Official Cucumber parser → compiled Pickles → preflight binding checks
          │
          ▼
Playwright → fresh browser context per scenario → actions + assertions
          │
          ▼
Capture → explicit privacy masks → CSS-pixel bounds → SVG + Sharp
          │
          ▼
Execution report + masked originals + annotated PNGs + SHA-256
          │ only when all scenarios pass
          ├── pdfcn / Forme → PDF + layout audit
          ├── HTML → responsive standalone handbook
          └── Markdown → portable guide
```

## Execution and publication

`runner.ts` performs preflight before opening the browser. A scenario gets its own Playwright context and page. Steps use strict bindings: zero matches and multiple matches are errors. Browser state is not carried between scenarios. Authentication can be restored from a local Playwright storage-state file.

Runs execute sequentially, keeping screenshot IDs and chapter order predictable. Output is built in a temporary directory and moved into a unique run directory. A failed scenario produces evidence without a handbook; an export failure removes partial handbook files. Concurrent runs cannot overwrite each other's artifacts. The MCP server refuses overlapping generation on its configured project.

## Coordinate model

Playwright `boundingBox()` returns viewport-relative CSS coordinates. Screenshots use `scale: 'css'`, so screenshot dimensions and annotation coordinates agree even at device scale factors above 1. Full-page capture moves the window to the origin before measuring. Viewport capture scrolls the first annotation target into view, then measures all targets and rejects out-of-frame regions.

The app receives only a temporary animation-freezing stylesheet. Drawing occurs on the captured buffer through an SVG overlay. Default arrow origins consider other marked bounds; explicit origins are available for editorial placement. Raw and annotated files both come from the same masked buffer.

## PDF integration

Pdfcn is a source registry. Selected Forme components and their supporting theme utilities are vendored under `src/pdfcn/`, with an exact upstream commit and MIT license in `THIRD_PARTY_NOTICES.md`. The project owns its document composition in `pdf.tsx`; colors and heading fonts are customized outside the vendored components.

The PDF uses pdfcn `Text`, `Heading`, `PdfImage`, `PageNumber` and its theme provider. Forme supplies Document, Page, Fixed and the WASM renderer. Long screenshots are split into readable image slices. The renderer's content audit rejects detected dropped or fully off-page content; visual inspection remains necessary for overlap, glyph coverage and editorial quality.

## Interfaces

The CLI, TypeScript API and MCP server use the same runner and artifact publication gate. Evidence-only builds validate the report and PNG hashes, reject paths that escape the source run, and preserve the original capture timestamp with a rebuild timestamp and source report hash. MCP exposes nine tools and read-only project/artifact resources plus authoring/review prompts with strict schemas and structured domain errors. Run selection reads persisted managed outputs, surviving restarts; capture inspection verifies hashes, dimensions and path containment. Generation supports progress and cancellation; generation/rebuild are serialized. Agents use their existing file/browser tools for discovery and spec authoring, then call hooserguide for deterministic execution and export. Agent skills encode the authoring and review workflow without adding an embedded LLM dependency.

Tests cover actual screenshot pixels, high-DPI scaling, scrolling, masking, saved-state failures, PDF rendering, Gherkin compilation, CLI package installation and MCP stdio round trips. CI runs Chromium on Linux; browser selection supports Firefox/WebKit but these are not currently included in CI coverage.

## Manual customization and delivery

Selection uses the official Cucumber tag-expression parser before binding validation. Reports preserve the actual filters and skipped scenarios. Optional prerequisites and callouts are rendered with escaped prose and localized labels. Shared page geometry controls pdfcn layouts and screenshot slices. The HTML viewer is an embedded static script with no remote dependencies or interpolation of application prose.

The shared evidence module provides managed/local run loading, path containment and PNG verification. A shared semantic gate rejects contradictory success states, duplicate image references and invalid annotations. Direct rendering verifies the same masked image evidence as rebuild and inspection. Comparison matches unique chapter/capture names after verifying both image variants; it compares decoded pixels and records execution-step, scenario-tag and browser changes while ignoring timings and PNG encoding. ZIP packaging uses a fixed artifact allowlist, reduces feature-source paths to basenames, records file hashes in a manifest and excludes executable configuration/authentication state. Archives use exclusive writes and cleanup partial failures.
