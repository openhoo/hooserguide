# Configuration and step reference

## Configuration

JSON config is validated strictly: unknown fields are errors. Optional `$schema` supports editor completion with `schemas/config.schema.json`.

| Field               | Default       | Meaning                                                      |
| ------------------- | ------------- | ------------------------------------------------------------ |
| `title`             | required      | Handbook title                                               |
| `baseURL`           | required      | HTTP(S) application URL for relative navigation              |
| `features`          | required      | Nonempty array of feature paths or glob patterns             |
| `output`            | `output`      | Parent directory for isolated runs                           |
| `tag`               | all scenarios | One tag such as `@manual`                                    |
| `tagExpression`     | none          | Cucumber tag expression; overrides `tag`                     |
| `scenario`          | none          | Case-insensitive scenario-name substring                     |
| `failFast`          | false         | Stop after first failed scenario and record skipped coverage |
| `document`          | none          | Guide/product version, audience and summary                  |
| `manual`            | A4 portrait   | Page size, orientation, margin, contents and date visibility |
| `captureDefaults`   | none          | Default auto-labels, mark color, focus padding and fullPage  |
| `language`          | `en`          | Browser locale and document language tag                     |
| `viewport`          | 1280 × 800    | Browser CSS viewport width/height                            |
| `deviceScaleFactor` | 1             | Browser scale factor; screenshots still use CSS pixels       |
| `browser`           | `chromium`    | Chromium, Firefox or WebKit                                  |
| `headed`            | false         | Open a visible browser for debugging                         |
| `timeoutMs`         | 10000         | Browser action/assertion timeout, 100–120000 milliseconds    |
| `storageState`      | none          | Local Playwright authentication state file                   |
| `masks`             | none          | Privacy selectors applied to every capture                   |
| `plugins`           | none          | Trusted local ESM step modules                               |
| `pdf`               | true          | Enable pdfcn / Forme PDF export                              |

`features`, `output`, `plugins` and `storageState` are relative to the config file. API config passed directly to `run()` is relative to the process working directory. Each feature pattern must match a file. Feature files are sorted and duplicate paths are deduplicated. Scenarios run sequentially in fresh browser contexts, with the configured authentication state loaded for each one.

Additional config fields:

| Field      | Default       | Meaning                                                        |
| ---------- | ------------- | -------------------------------------------------------------- |
| `profiles` | none          | Named browser settings for responsive runs                     |
| `profile`  | base settings | Selected profile name; CLI `--profile` overrides it            |
| `branding` | hooserguide   | Optional `name`, `subtitle` and hex `accentColor` for HTML/PDF |

See [advanced workflows](advanced.md) for complete profiles, branding, focus captures and evidence-only rebuilds.

See [customization and sharing](customization.md) for all fields and override rules.

## Selectors

| String             | Object equivalent                 |
| ------------------ | --------------------------------- |
| `role=button:Save` | `{"role":"button","name":"Save"}` |
| `label=Email`      | `{"label":"Email"}`               |
| `text=Saved`       | `{"text":"Saved"}`                |
| `testid=save`      | `{"testId":"save"}`               |
| `css=#save`        | `{"css":"#save"}`                 |
| `#save`            | `{"css":"#save"}`                 |

Accessible names, labels and text use exact matching. Bare strings are Playwright locator selectors. Mark targets must resolve to one visible element; masking selectors may match multiple elements but must match at least one. For unusual accessible names containing colons, the string role selector splits only at the first colon.

## Built-in step phrases

| Phrase                                            | Effect                                                         |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `I open "/settings"`                              | Navigate and wait for DOM content                              |
| `I click "role=button:Save"`                      | Click a locator                                                |
| `I fill "label=Name" with "Demo"`                 | Fill a text field                                              |
| `I fill "label=Password" from env "APP_PASSWORD"` | Fill without storing the value in the feature/report step text |
| `I select "high" in "label=Priority"`             | Select an option by value                                      |
| `I check "label=Notifications"`                   | Check a checkbox                                               |
| `I uncheck "label=Notifications"`                 | Uncheck a checkbox                                             |
| `I press "Enter" on "label=Search"`               | Send a key to a locator                                        |
| `I scroll to "testid=preferences"`                | Scroll a locator into view                                     |
| `"role=heading:Settings" is visible`              | Retry a visibility assertion                                   |
| `"role=status:Result" has text "Saved"`           | Retry an exact text assertion                                  |
| `I explain "Select Save."`                        | Add user-facing prose to the chapter                           |
| `I add a prerequisite "Sign in as an editor."`    | Add a descriptive chapter prerequisite                         |
| `I add a note "Only your profile changes."`       | Add an informational callout                                   |
| `I add a tip "Use a recognizable name."`          | Add a tip callout                                              |
| `I add a warning "Review before saving."`         | Add a warning callout                                          |
| `I capture "Settings"`                            | Capture and optionally annotate the current state              |

Additional built-in steps:

| Phrase                                                              | Effect                                       |
| ------------------------------------------------------------------- | -------------------------------------------- |
| `I fill the form:`                                                  | Fill inputs from a selector/value data table |
| `I hover "role=button:Help"`                                        | Hover a locator                              |
| `I double click "testid=item"`                                      | Double-click a locator                       |
| `I clear "label=Search"`                                            | Clear an input                               |
| `I upload "fixtures/avatar.png" to "label=Avatar"`                  | Upload a feature-relative file               |
| `I drag "testid=task" to "testid=column"`                           | Drag an element to another element           |
| `I reload the page`                                                 | Reload for persistence checks                |
| `I go back` / `I go forward`                                        | Navigate browser history                     |
| `"testid=loading" is hidden`                                        | Assert hidden or detached state              |
| `"role=button:Save" is enabled` / `is disabled`                     | Assert control state                         |
| `"label=Notifications" is checked` / `is unchecked`                 | Assert checkbox state                        |
| `"label=Name" has value "Demo"`                                     | Assert an input value                        |
| `"testid=tasks" contains text "Launch"`                             | Assert a substring                           |
| `"css=.task" has count 3`                                           | Assert the match count                       |
| `"role=button:Save" has attribute "aria-pressed" with value "true"` | Assert an attribute                          |
| `the URL is "/settings"`                                            | Assert exact URL relative to `baseURL`       |
| `the page title is "Settings"`                                      | Assert the document title                    |

`hooserguide steps --json` returns patterns, examples and descriptions. Add `--config` for plugins; custom bindings may pass `{example, description}` as the third argument to `registry.define`.

Phrases are case-sensitive. `Given`, `When`, `Then`, `And` and `But` have normal Gherkin semantics. Use escaped quotes (`\"`) inside quoted arguments. The official Gherkin parser compiles outlines, backgrounds and localized keywords; plugins can handle additional behavior and data tables.

## Capture docstring

```gherkin
And I capture "Settings"
  """json
  {
    "description": "Check reference A before saving.",
    "fullPage": false,
    "masks": ["testid=private-email"],
    "marks": [
      {
        "target": { "role": "button", "name": "Save" },
        "kind": "both",
        "label": "A",
        "caption": "Save your changes.",
        "color": "#e11d48",
        "from": { "x": 900, "y": 400 }
      }
    ]
  }
  """
```

`kind` defaults to `box`; alternatives are `arrow` and `both`. Labels are optional and contain 1–4 ASCII letters/digits. Captioned marks without explicit labels receive unique numeric references. Caption-less marks remain unlabeled unless `autoLabels` is selected. Legacy rebuilds display unlabeled captions without inventing references. `color` is a six-digit hex color. `from` is optional: automatic arrow origins try to avoid other marked targets. Explicit coordinates are screenshot CSS pixels and must be inside the image.

`focus`, `padding` and `autoLabels` are described in [advanced workflows](advanced.md).

`fullPage` defaults to false. Full-page captures start at the document origin for consistent scroll coordinates. Viewport captures scroll the first marked element into view and reject targets outside the final viewport. Split captures if all controls cannot fit in one image. On zoomed mobile pages, target coordinates are transformed into final screenshot pixels; full-page and focus captures retain document CSS pixels.

Original and annotated PNGs are masked before writing. Missing privacy selectors fail the capture. Masking is explicit; it is not automatic PII detection. CSS motion and running Web Animations are frozen before target measurement; previously paused Web Animations remain paused; annotations are rendered with an SVG layer and Sharp, without adding drawing elements to the application DOM.

## Reports and failures

`report.json` schema version is 1. It records the timestamp, browser, language, chapters, executed steps, errors and captures. Captures contain relative image paths, image dimensions, target bounds and the SHA-256 of the annotated PNG and, for 0.2+ captures, the masked raw PNG. The report also includes effective viewport/profile, per-step `durationMs` and optional branding. See [report schema](../schemas/report.schema.json). Source paths in your own runs are absolute for traceability; the committed demo uses portable relative paths.

The run status is failed if any scenario or exporter fails. Failed scenarios retain available screenshot evidence. No HTML, Markdown or PDF handbook is published for a failed run. An export failure appears in `exportError`. Preflight errors throw before launching the browser. Exported files appear under a unique run directory; previous runs are never reused as current evidence.

Full-page screenshots are split into page-sized images in the PDF to preserve readability. HTML and Markdown use the complete image. `pdf-layout.json` records page count, rendering warnings from the Forme content audit, and each figure's exact pixel slice ranges. Legends appear alongside the slice containing their target. Very tall annotation groups may span slices; inspect the rendered pages. Standard fonts cover common Latin text; custom embedded fonts are needed for other scripts. The default document template uses English structural labels, with authored prose and browser/document language controlled by the config.

## Evidence integrity

Every report reader and renderer validates the strict report schema and execution consistency. A passed report must have passing chapters and steps, at least one step and capture per chapter, no recorded errors (including empty error strings), and no skipped scenarios. Screenshot IDs and paths must be unique across the run; reference labels must be unique within each capture, and annotation bounds must fit the image.

Rebuild, inspection, comparison and bundle share contained artifact reads: reports and layout files are limited to 2 MiB, image/manual files to 64 MiB. Escaping symlinks are rejected, including a symlinked `report.json`. The direct `renderManual` and `renderPdf` APIs also verify both PNG variants before exporting. Legacy reports without raw hashes remain readable, with the limitation explicitly reported during inspection/comparison.

Comparison includes browser engine, scenario tags and executed step text/status/error. Step durations and PNG compression changes are ignored; both annotated and raw pixels are decoded before comparison. An unchanged comparison does not replace visual review or prove that the application is current.

With `--json`, CLI results occupy stdout and trusted plugin console diagnostics go to stderr. Plugins must not write directly to stdout. Exceptional command failures return their JSON diagnostic on stderr with exit code 1; completed failed runs return a failed run summary on stdout with exit code 1.
