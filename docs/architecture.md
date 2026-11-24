# How a guide is built

A guide starts as Gherkin and ends as a report, screenshots and reader files. The CLI, TypeScript API, MCP server and CI adapters call the same runner. A rebuild starts later in the process: it reads existing evidence and never opens the application.

```text
Gherkin + config + trusted local steps
  → select and validate scenarios
  → execute each scenario/profile in Playwright
  → capture a masked PNG and add annotations to a copy
  → verify report and image evidence
  → render PDF, HTML and Markdown
```

## Where to make a change

| Area                 | Source modules under `src/`                                           | Behavior to preserve                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config and authoring | `config.ts`, `gherkin.ts`, `authoring.ts`, `preflight.ts`, `steps.ts` | Cucumber compiles Backgrounds, Rules and Outline rows into executable scenarios. Apply tag and scenario filters before resolving bindings. Undefined steps, ambiguous steps and invalid built-in arguments fail preflight. |
| Execution            | `runner.ts`, `artifacts.ts`                                           | Each selected scenario/profile gets a fresh browser context; engines can be reused. Actions run sequentially. Preserve selection, skips, step results and per-screen identity even on failure.                             |
| Screenshots          | `capture.ts`, `annotations.ts`                                        | Both image variants come from the same masked pixels. Keep target, mask and reference positions aligned at different zoom and scale factors.                                                                               |
| Evidence             | `report.ts`, `evidence.ts`, `build.ts`, `compare.ts`                  | Validate the report and cross-field consistency. Verify contained artifact paths, decoded image format/dimensions and available hashes. Keep old evidence distinct from a fresh app check.                                 |
| Reader and PDF       | `responsive.ts`, `render.ts`, `viewer.ts`, `pdf.tsx`, `pdf-slices.ts` | Group matching screen executions only when presenting them. Name the screens for differing instructions. Preserve captions, pixel coverage and localized labels in every export.                                           |
| Delivery             | `bundle.ts`, `pages.ts`, `gitlab.ts`, `pages-ci.ts`                   | Publish only the intended verified run. Re-export reader files, strip local source paths from the portable report, and keep the ZIP manifest tied to its inputs.                                                           |

## What qualifies as successful evidence

A successful report requires passing chapters and steps, a capture in every chapter, no skipped executions or export error, and consistent screenshot references. Responsive reports additionally require each selected screen for every scenario with matching capture titles and order. The recorded execution chapters remain independent even though the reader sees one grouped chapter.

The runner stages output and moves it to a unique directory. A failed action or export retains diagnostics without exposing a successful handbook. Browser contexts isolate session state between executions; changes made to the application backend can persist. Managed MCP run IDs survive server restarts. See [integration](integration.md) for selection and cancellation behavior.

## How pixels stay aligned

Viewport captures scroll the first marked target into view. Full-page and focus captures measure from the document origin. Playwright captures at CSS scale; the viewport path also maps visual-viewport offsets and scaling into raster coordinates. Focus crops subtract the cropped origin. A capture waits for fonts and frames within the configured timeout, pauses running animations, and checks mask matches and positions around the screenshot. Sharp composites the SVG annotations onto the masked buffer outside the application's DOM.

## How exports stay traceable

Forme renders the PDF from the project's composition and pinned MIT-licensed pdfcn components. See [third-party notices](../THIRD_PARTY_NOTICES.md). The PDF renderer slices long images around annotation groups where possible and checks Forme's content audit. It cannot certify that a reader will understand the arrows or that every glyph looks right; [visual review](review.md) verifies the rendered pages. The HTML reader's search and image switch run offline.

Rebuilds preserve the source capture time and add a rebuild timestamp and original report hash. Comparison verifies both runs and compares decoded pixels, prose, execution steps, tags and browser metadata; timing or PNG compression alone does not count as a change. Legacy raw images without a hash remain explicitly unverified. Pages regenerates the site and ZIP from the same staged files. See [customization and sharing](customization.md) for the user-facing contracts and [contributing](../CONTRIBUTING.md) for verification commands.
