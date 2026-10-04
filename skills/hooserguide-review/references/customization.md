# Customize, review and share your guide

## Select workflows and stop on failure

Use Cucumber tag expressions with `and`, `or`, `not` and parentheses. Tags inherited from Feature, Rule and Examples participate in selection. `tagExpression` overrides the legacy single `tag`; `scenario` adds a case-insensitive name substring filter. Filters are applied before step binding validation, so unrelated scenarios can remain outside your documentation run.

```json
{
  "title": "Workspace guide",
  "baseURL": "http://localhost:3000",
  "features": ["features/*.feature"],
  "tagExpression": "@manual and (@editor or @admin) and not @destructive",
  "scenario": "settings",
  "failFast": true
}
```

```sh
hooserguide validate --config hooserguide.config.json --tags '@manual and not @destructive' --scenario settings --json
hooserguide run --config hooserguide.config.json --tags '@manual and not @destructive' --scenario settings --fail-fast --json
```

Validate and generate with the same profile and filters. Validation reports selected names, features, tags, step counts and built-in capture counts; it opens no browser and does not verify app selectors. Custom steps that capture images cannot be inferred from their text.

`--no-fail-fast` overrides an enabled config setting for one CLI run. Without `failFast`, independent scenarios continue after a failure. With it, later scenarios are recorded in `skippedScenarios` with reason `fail-fast`. Cancellation records unstarted scenarios as `cancelled`. Neither produces a successful handbook. Reports retain `selection` for coverage review; a passing filtered run verifies only that selection.

## Add user-facing guidance

```gherkin
And I add a prerequisite "Sign in with editor permissions."
And I add a note "Only your own profile is affected."
And I add a tip "Use a name your colleagues recognize."
And I add a warning "Check the changes before selecting Save."
And I explain "Select Save and check the confirmation."
```

Prerequisites are descriptions, not executable assertions. Assert the required state separately. Prerequisites and callouts appear as chapter guidance before the numbered instructions in HTML, Markdown and PDF. The original step order remains in `report.json`. Empty guidance is rejected. Prose is escaped rather than interpreted as HTML.

## Configure document identity, language and PDF geometry

```json
{
  "language": "de-DE",
  "branding": {
    "name": "Acme",
    "subtitle": "Sicher durch den Arbeitsalltag",
    "accentColor": "#2563eb"
  },
  "document": {
    "version": "2.0",
    "productVersion": "2026.10",
    "audience": "Redaktion",
    "summary": "Die wichtigsten Abläufe für die tägliche Arbeit."
  },
  "manual": {
    "theme": "professional",
    "pageSize": "Letter",
    "orientation": "landscape",
    "margin": 36,
    "contents": true,
    "showGeneratedAt": true
  }
}
```

These are optional fields to add to a complete config. `language` sets the browser locale and document language. Guide labels use German for `de`/`de-*` and English otherwise. Scenario names, explanations and captions stay in the language you authored; UI content is not automatically translated. PDF page numbers and image continuation labels are localized too.

| Setting                   | Default        | Behavior                                                                         |
| ------------------------- | -------------- | -------------------------------------------------------------------------------- |
| `document.version`        | omitted        | Handbook version shown in all three formats                                      |
| `document.productVersion` | omitted        | Application version label                                                        |
| `document.audience`       | omitted        | Intended readers                                                                 |
| `document.summary`        | omitted        | Cover/hero introduction                                                          |
| `manual.theme`            | `professional` | Shared HTML/PDF palette: professional, ocean, forest, sand, midnight or graphite |
| `manual.pageSize`         | `A4`           | `A4` or `Letter`                                                                 |
| `manual.orientation`      | `portrait`     | `portrait` or `landscape`                                                        |
| `manual.margin`           | `48`           | PDF margins in points, between 24 and 72                                         |
| `manual.contents`         | `true`         | PDF cover and Markdown table of contents; HTML navigation remains available      |
| `manual.showGeneratedAt`  | `true`         | Show capture/rebuild dates in the document; report evidence retains timestamps   |

Long screenshots are sliced according to the chosen page geometry, preserving all pixels and annotation groups where space allows. The PDF audit includes actual page dimensions and margin in `pdf-layout.json`.

```sh
hooserguide run --config hooserguide.config.json --page-size Letter --landscape --margin 36
hooserguide build <run-directory> --orientation portrait --page-size A4
```

`--orientation portrait|landscape` is explicit; `--landscape` is a shortcut. Use one of them. CLI settings override config. Rebuild merges optional `document` and `manual` overrides with original settings and applies current config branding/metadata/layout. It uses original screenshots and capture time. With `--config`, rebuild respects that config's PDF setting; `--no-pdf` disables it explicitly.

## Set screenshot defaults

```json
{
  "captureDefaults": {
    "autoLabels": "letters",
    "color": "#2563eb",
    "padding": 40,
    "fullPage": false
  }
}
```

`autoLabels`, `color`, `padding` and `fullPage` are optional. Per-capture settings override defaults; explicit mark colors override the default color. Default padding applies only to focused captures. A focused capture disables the inherited `fullPage` setting. Explicitly combining focus and fullPage remains an error. Privacy masks continue to apply to both variants independently of these defaults.

## Use the offline HTML reader

Open `index.html` directly or host the complete run directory. JavaScript adds a chapter search, annotation toggle and Print button without any remote dependency. Search matches all entered terms against chapter prose, prerequisites, callouts and captions. It hides nonmatching chapters and navigation items, announces the count and handles zero matches. Printing includes all chapters even when search is active. The annotation toggle switches between the masked original and annotated PNG and hides legends for originals. Printing preserves the chosen image variant.

Without JavaScript, the complete guide, navigation and downloads remain usable. The optional toolbar is hidden. Controls have labels, visible keyboard focus, responsive sizing and reduced-motion support.

The theme selector and **Download PDF** control appear before the guide title.
The PDF control exists only when a PDF was generated and works without JavaScript.
Theme switching needs JavaScript and persists per guide path when browser storage
is available. `midnight` and `graphite` are dark; the remaining presets are light.
Browser printing uses a light palette. Switching the reader theme does not
regenerate the PDF; its palette is the configured `manual.theme`.

`run` and evidence-only `build` accept `--theme <name>`. To change a delivered PDF's
theme, rebuild the exact successful source run with that option or a config
`manual.theme`. Review custom `branding.accentColor` for contrast on the selected
palette. Screenshot colors remain the application's captured evidence colors.

## Inspect and compare evidence

```sh
hooserguide inspect <run-directory> --json
hooserguide compare <before-run> <after-run> --json
```

`inspect` reads the report and verifies both PNG variants against recorded hashes, dimensions and format. `verifiedImages` counts images with stored matching hashes; `legacyRawWithoutHash` identifies original images from older reports. Its `status` is the inspected run's execution status, not a new browser check.

`compare` verifies images before matching chapters by unique `(feature, title)` and captures by unique title within each chapter. Ambiguous titles fail with a repair hint; use distinct Scenario Outline names. It reports chapter additions/removals, prose changes, image changes, annotation-definition changes and metadata/order changes. Matching stored raw hashes establish integrity before decoded RGBA pixels are compared. Recompressing identical pixels does not count as a pixel change. Pixel comparison is limited to 32 megapixels per image. For legacy raw evidence, `rawHashesAvailable: false` and absent `pixelsChanged` mean that distinction is unverified. This is an exact evidence comparison, not a perceptual similarity or persistence check. Durations, run IDs and timestamps are excluded from ordinary differences.

```ts
import { inspectRun, compareRuns, bundle } from '@openhoo/hooserguide';
const inspection = await inspectRun('output/guides/run-...');
const comparison = await compareRuns('output/guides/run-before', 'output/guides/run-after');
const archive = await bundle('output/guides/run-after', 'deliverables/user-guide.zip');
```

## Share a portable ZIP

```sh
hooserguide bundle <run-directory> --output deliverables/user-guide.zip --json
```

ZIP packaging requires successful, intact evidence. It includes HTML, Markdown, optional PDF, both masked screenshot variants, the report, optional PDF audit and `bundle-manifest.json`. Config, feature source files, plugins, overlays, cookies and login state are excluded. Local feature paths in the copied report are reduced to basenames; source files and the original report remain untouched. The manifest records the original report hash plus path, bytes and SHA-256 of every included artifact except the manifest itself.

The default destination is `<run-directory>.zip`. Existing files are never overwritten. Extract the full archive and open `index.html`; relative images and downloads keep working. Review screenshot and prose privacy before external delivery. Packaging verifies stored evidence, but does not discover unmasked personal data.

Limits: 64 MiB per manual/image, 2 MiB report/PDF audit, and 128 MiB total source artifacts. ZIP size and its hash are returned. The API accepts `{signal}` as its third argument; cancelled or failed writes remove their partial file. MCP writes unique bundles under the configured output's `bundles/` directory. Packaging itself does not publish externally.
