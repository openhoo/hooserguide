# Configuration and step reference

## Configuration

JSON config is validated strictly: unknown fields are errors. Optional `$schema` supports editor completion with `schemas/config.schema.json`.

| Field               | Default       | Meaning                                                   |
| ------------------- | ------------- | --------------------------------------------------------- |
| `title`             | required      | Handbook title                                            |
| `baseURL`           | required      | HTTP(S) application URL for relative navigation           |
| `features`          | required      | Nonempty array of feature paths or glob patterns          |
| `output`            | `output`      | Parent directory for isolated runs                        |
| `tag`               | all scenarios | One tag such as `@manual`                                 |
| `language`          | `en`          | Browser locale and document language tag                  |
| `viewport`          | 1280 × 800    | Browser CSS viewport width/height                         |
| `deviceScaleFactor` | 1             | Browser scale factor; screenshots still use CSS pixels    |
| `browser`           | `chromium`    | Chromium, Firefox or WebKit                               |
| `headed`            | false         | Open a visible browser for debugging                      |
| `timeoutMs`         | 10000         | Browser action/assertion timeout, 100–120000 milliseconds |
| `storageState`      | none          | Local Playwright authentication state file                |
| `masks`             | none          | Privacy selectors applied to every capture                |
| `plugins`           | none          | Trusted local ESM step modules                            |
| `pdf`               | true          | Enable pdfcn / Forme PDF export                           |

`features`, `output`, `plugins` and `storageState` are relative to the config file. API config passed directly to `run()` is relative to the process working directory. Each feature pattern must match a file. Feature files are sorted and duplicate paths are deduplicated. Scenarios run sequentially in fresh browser contexts, with the configured authentication state loaded for each one.

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
| `I capture "Settings"`                            | Capture and optionally annotate the current state              |

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

`kind` defaults to `box`; alternatives are `arrow` and `both`. Labels are optional and contain 1–4 ASCII letters/digits. Captions become legend entries. `color` is a six-digit hex color. `from` is optional: automatic arrow origins try to avoid other marked targets. Explicit coordinates are screenshot CSS pixels and must be inside the image.

`fullPage` defaults to false. Full-page captures start at the document origin for consistent scroll coordinates. Viewport captures scroll the first marked element into view and reject targets outside the final viewport. Split captures if all controls cannot fit in one image.

Original and annotated PNGs are masked before writing. Missing privacy selectors fail the capture. Masking is explicit; it is not automatic PII detection. A temporary style freezes CSS motion; annotations are rendered with an SVG layer and Sharp, without adding drawing elements to the application DOM.

## Reports and failures

`report.json` schema version is 1. It records the timestamp, browser, language, chapters, executed steps, errors and captures. Captures contain relative image paths, image dimensions, target bounds and the SHA-256 of the annotated PNG. Source paths in your own runs are absolute for traceability; the committed demo uses portable relative paths.

The run status is failed if any scenario or exporter fails. Failed scenarios retain available screenshot evidence. No HTML, Markdown or PDF handbook is published for a failed run. An export failure appears in `exportError`. Preflight errors throw before launching the browser. Exported files appear under a unique run directory; previous runs are never reused as current evidence.

Full-page screenshots are split into page-sized images in the PDF to preserve readability. HTML and Markdown use the complete image. `pdf-layout.json` records page count and rendering warnings from the Forme content audit. Standard fonts cover common Latin text; custom embedded fonts are needed for other scripts. The default document template uses English structural labels, with authored prose and browser/document language controlled by the config.
