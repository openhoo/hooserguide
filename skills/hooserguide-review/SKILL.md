---
name: hooserguide-review
description: Review generated hooserguide manuals against BDD execution evidence, annotated screenshots and rendered pdfcn PDF pages. Use when checking handbook correctness, screenshot references, privacy masks or export quality.
---

# Review a hooserguide manual

Locate the exact run directory from the CLI/MCP result. Review that directory's `report.json`, images and exports together; do not combine evidence from different runs.

## Check execution evidence

- Require top-level `status: passed` and every chapter/step to pass. `exportError` means the export failed even when the browser workflows passed.
- Compare requested tasks with scenario names and steps. A passing subset is not complete coverage.
- Verify saved outcomes are asserted after the relevant action. A screenshot or successful click alone does not prove persistence.
- If provenance matters, recompute each annotated PNG's SHA-256 and compare with `captures[].sha256`.
- Use `pdf-layout.json` to check PDF warnings. Its content audit supplements visual review; it does not replace it.

## Inspect real visuals

Open annotated PNGs and compare them with the masked `.raw.png` originals. If using MCP, `hooserguide_inspect_capture` returns the annotated image and its metadata for one-based chapter/capture indices.

Confirm each box surrounds the intended control, each arrow reaches its target and every letter/number agrees with the prose legend. Check references near screenshot edges and on scrolled pages. Labels and captions should stay readable without hiding essential state.

Look for personal data in both original and annotated files. Config `masks` and capture `masks` affect both. Missing selectors fail closed, but the absence of a mask does not prove the app contains no private data. Avoid dumping private screenshot text or credentials into reports.

Open the generated HTML at desktop and narrow widths. Check chapter navigation, focus, image sizing and escaped prose. Render the PDF to images with available PDF tooling, inspect its cover and all content pages, and verify screenshot slices preserve the full content at readable scale. Do not treat extracted text as evidence of correct layout.

## Fix and conclude

Repair the feature/config or template responsible for a concrete problem, regenerate and review the new run. Keep changes scoped to the requested handbook. State which tasks and formats were verified, list any unverified coverage and deliver exact artifact paths. Publishing remains a separate action unless already authorized by the user.
