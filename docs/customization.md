# Customize, review and share your guide

Choose what to capture before you run. After a passing run, you can [change the theme](#manual-themes), [compare it to an earlier run](#inspect-and-compare-evidence) or [make an offline ZIP](#share-a-portable-zip) without repeating the workflow. Run examples beside `hooserguide.config.json`; replace `RUN` with the directory printed by generation.

## Select workflows and stop on failure

Use tags to select a group of scenarios and `--scenario` to narrow it by a case-insensitive name substring. The following commands check and run the same selection:

```sh
npx hooserguide validate --tags '@manual and not @destructive' --scenario settings
npx hooserguide run --tags '@manual and not @destructive' --scenario settings --fail-fast --json
```

Set `tagExpression`, `scenario` and `failFast` in the config for a standing selection. Cucumber expressions support `and`, `or`, `not` and parentheses, including tags inherited from Features, Rules and Examples. `tagExpression` takes precedence over the single `tag`. Unselected scenarios are excluded before binding validation.

By default, independent scenarios continue after one fails. With `--fail-fast`, the report lists subsequent executions in `skippedScenarios` with reason `fail-fast`; cancellation uses `cancelled`. Use `--no-fail-fast` to override the configured setting. A failure prevents handbook publication. The report's `selection` records which scenarios the run covered.

## Add user-facing guidance

```gherkin
And I add a prerequisite "Sign in with editor permissions."
And I add a note "Only your own profile is affected."
And I add a tip "Use a name your colleagues recognize."
And I add a warning "Check the changes before selecting Save."
And I explain "Select Save and check the confirmation."
```

Prerequisites and callouts appear before the numbered instructions in all three formats. Each entry needs text. They describe the task; use a separate assertion for any state the guide promises. The report preserves the original execution order.

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
    "pageSize": "Letter",
    "orientation": "landscape",
    "margin": 36,
    "contents": true,
    "showGeneratedAt": true
  }
}
```

These are optional fields in a complete config. `language` sets the browser locale and document language. Structural labels, including PDF page numbers, use German for `de` and its regional forms and English otherwise. Write scenario names, captions and instructions in the intended language yourself.

| Setting                                                     | Default      | Effect                                                                                                    |
| ----------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------- |
| `document.version`, `productVersion`, `audience`, `summary` | Omitted      | Guide version, application version, intended readers and introduction.                                    |
| `manual.pageSize`, `orientation`                            | A4, portrait | Use A4 or Letter in portrait or landscape.                                                                |
| `manual.margin`                                             | 48           | PDF margin in points, from 24 to 72.                                                                      |
| `manual.contents`                                           | `true`       | Show a PDF/Markdown contents list. PDF chapter bookmarks and HTML navigation remain available either way. |
| `manual.showGeneratedAt`                                    | `true`       | Show capture and rebuild dates in the document. The report keeps its timestamps either way.               |

For a new PDF from existing screenshots:

```sh
RUN="output/hooserguide/run-…"
npx hooserguide build "$RUN" --config hooserguide.config.json --page-size Letter --landscape --margin 36
```

CLI settings override the config; use either `--orientation portrait|landscape` or `--landscape`. The [rebuild](advanced.md#rebuild-from-existing-evidence) preserves the capture time. Long screenshots can span pages; `pdf-layout.json` records page dimensions, slice ranges and warnings. The PDF contains headings, chapter links/bookmarks and image alternatives, including screen labels and continuation parts.

## Manual themes

Set `manual.theme` in the config, or test a different preset on an existing run: `npx hooserguide build "$RUN" --theme midnight`.

| Theme                    | Appearance                   |
| ------------------------ | ---------------------------- |
| `professional` (default) | Light, slate and teal        |
| `ocean`                  | Light, blue                  |
| `forest`                 | Light, green                 |
| `sand`                   | Light, warm paper and bronze |
| `midnight`               | Dark, navy and sky blue      |
| `graphite`               | Dark, charcoal and lavender  |

The preset styles HTML and PDF. The HTML theme picker remembers a choice for the handbook path when browser storage is available. It changes the reader only; downloads keep the generated PDF theme. Browser printing uses a light palette. Without JavaScript, the configured theme and PDF download still work. Screenshots keep their original colors in every format, and Markdown has no theme styling.

`branding.accentColor` preserves the exact color for decoration. Accent text uses it only when it reaches 4.5:1 contrast on every text surface; otherwise the preset supplies the text color. Built-in control borders and focus indicators target at least 3:1 contrast. For the TypeScript theme catalogue, import `manualThemeNames`, `manualThemes` and `resolveManualTheme`.

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

Open `index.html` with its sibling screenshots and downloads in place. Search matches all entered terms across chapter text, guidance and captions. **Show annotations** switches between the annotated and masked original images; legends are shown only for annotations. **Print** includes every chapter even during a search and keeps the chosen image variant. The print button waits for images to decode.

Without JavaScript, the full handbook, links and downloads remain available offline.

## Inspect and compare evidence

```sh
npx hooserguide inspect "$RUN" --json
npx hooserguide compare "$BEFORE" "$RUN" --json
```

Set `BEFORE` to the earlier run's directory. `inspect` reports the recorded execution status and checks the PNGs. `verifiedImages` counts images with matching stored hashes; `legacyRawWithoutHash` counts older originals without a recorded hash.

`compare` matches chapters by feature, scenario title and, for responsive runs, profile. Within a chapter it matches figures by title. Use distinct scenario and figure titles so each match is unambiguous.

- Prose, tags, step text/status/errors, browser and profile metadata, figure order and annotation changes are reported. Timing and encoding-only differences are ignored.
- Raw and annotated PNGs are decoded for an exact pixel comparison, limited to 32 megapixels per image. For legacy raw images, `rawHashesAvailable: false` and an absent `pixelsChanged` mean the raw change could not be verified.
- An unchanged guide describes those two runs only. To check the current app, generate fresh evidence.

The library equivalents are `inspectRun(directory)` and `compareRuns(beforeDirectory, afterDirectory)`.

## Share a portable ZIP

```sh
npx hooserguide bundle "$RUN" --output deliverables/user-guide.zip --json
```

The source must be a passing run with intact evidence. Packaging regenerates the manuals from the verified screenshots and a report using feature basenames. It does not copy the previous exports or include executable plugins, config, feature files, SVG overlays, cookies or login state.

The archive includes HTML, Markdown, both screenshot variants, the report and, if the run had a PDF, a PDF and layout audit. `bundle-manifest.json` lists the original report hash and the path, size and SHA-256 of each other file. Review the regenerated guide and both masked variants before delivery; integrity checks cannot discover personal data left visible.

By default the archive is written beside the run as `<run-directory>.zip`. Existing ZIPs are preserved. Extract the whole archive and open `index.html`, or use [Pages](pages.md) for a hosted guide.

Limits are 64 MiB per manual/image, 2 MiB for the report or PDF audit, and 128 MiB total artifacts. The CLI returns the ZIP size and hash. The API accepts `bundle(directory, destination, { signal })`; cancelled or failed writes remove the partial ZIP. MCP creates unique archives under `bundles/` in the configured output.
