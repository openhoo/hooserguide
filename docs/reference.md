# Configuration and step reference

Look up [configuration](#configuration), [selectors](#selectors), [step phrases](#built-in-step-phrases), [screenshot options](#capture-docstring) or [report fields](#reports-and-failures). For a first scenario, follow the [authoring guide](authoring.md).

## Configuration

Save this as `hooserguide.config.json` beside your `features/` directory and point `baseURL` at your running app:

```json
{
  "title": "Workspace guide",
  "baseURL": "http://localhost:3000",
  "features": ["features/*.feature"]
}
```

Unknown fields are rejected. The [configuration schema](../schemas/config.schema.json) lists accepted values; the [editor setup](authoring.md#start-with-an-editor-workspace) installs a local copy.

| Field               | Default       | Meaning                                                                            |
| ------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `title`             | required      | Handbook title                                                                     |
| `baseURL`           | required      | HTTP(S) application URL for relative navigation                                    |
| `features`          | required      | Nonempty array of feature paths or glob patterns                                   |
| `output`            | `output`      | Parent directory for isolated runs                                                 |
| `tag`               | all scenarios | One tag such as `@manual`                                                          |
| `tagExpression`     | none          | Cucumber tag expression; overrides `tag`                                           |
| `scenario`          | none          | Case-insensitive scenario-name substring                                           |
| `failFast`          | false         | Stop after first failed scenario and record skipped coverage                       |
| `document`          | none          | Guide/product version, audience and summary                                        |
| `manual`            | A4 portrait   | Theme, page size, orientation, margin, contents and date visibility                |
| `captureDefaults`   | none          | Default auto-labels, mark color, focus padding and fullPage                        |
| `language`          | `en`          | Browser locale and document language tag                                           |
| `viewport`          | 1280 × 800    | Browser CSS viewport width/height                                                  |
| `deviceScaleFactor` | 1             | Browser scale factor; screenshots still use CSS pixels                             |
| `browser`           | `chromium`    | Chromium, Firefox or WebKit                                                        |
| `headed`            | false         | Open a visible browser for debugging                                               |
| `timeoutMs`         | 10000         | Browser action/assertion timeout, 100–120000 milliseconds                          |
| `storageState`      | none          | Local Playwright authentication state file                                         |
| `masks`             | none          | Privacy selectors applied to every capture                                         |
| `plugins`           | none          | Trusted local ESM step modules                                                     |
| `pdf`               | true          | Enable pdfcn / Forme PDF export                                                    |
| `profiles`          | none          | Named browser settings; see [profile examples](advanced.md#named-browser-profiles) |
| `profile`           | base settings | Default profile name; `--profile` overrides it                                     |
| `responsive`        | none          | Two to four profiles, their order, labels and [presentation layout](responsive.md) |
| `branding`          | hooserguide   | Display name, subtitle and six-digit hex accent color                              |

Paths in `features`, `output`, `plugins` and `storageState` resolve relative to the config file. When passing a config object directly to `run()`, relative paths resolve from the process working directory. Each feature pattern must match; files are sorted and deduplicated. Each selected scenario gets a fresh browser context and the configured storage state.

### Theme selection

`manual.theme` sets the default HTML and PDF theme. `--theme` overrides it for `run` and `build`. See [manual themes](customization.md#manual-themes) for the six presets and reader controls.

## Selectors

| String             | Object equivalent                 |
| ------------------ | --------------------------------- |
| `role=button:Save` | `{"role":"button","name":"Save"}` |
| `label=Email`      | `{"label":"Email"}`               |
| `text=Saved`       | `{"text":"Saved"}`                |
| `testid=save`      | `{"testId":"save"}`               |
| `css=#save`        | `{"css":"#save"}`                 |
| `#save`            | `{"css":"#save"}`                 |

Use string selectors inside Gherkin steps. In a capture or config, you can also use the object form. Accessible names, labels and text match exactly; `role=button:Save: draft` selects a button named “Save: draft”. Unprefixed strings go to Playwright. Annotation and focus targets require one visible element. Each privacy selector must match at least one element and can mask several.

## Built-in step phrases

Use `npx hooserguide steps --search save` to find a phrase. Add `--config hooserguide.config.json` to include local plugins, or `--json` for the binding patterns, examples and descriptions. The phrases below are case-sensitive. Gherkin keywords may be localized; escape quotes inside arguments as `\"`.

### Navigate and interact

| Phrase                                             | Effect                                                         |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `I open "/settings"`                               | Navigate and wait for DOM content                              |
| `I click "role=button:Save"`                       | Click a locator                                                |
| `I fill "label=Name" with "Demo"`                  | Fill a text field                                              |
| `I fill "label=Password" from env "APP_PASSWORD"`  | Fill without storing the value in the feature/report step text |
| `I select "high" in "label=Priority"`              | Select an option by value                                      |
| `I check "label=Notifications"`                    | Check a checkbox                                               |
| `I uncheck "label=Notifications"`                  | Uncheck a checkbox                                             |
| `I press "Enter" on "label=Search"`                | Send a key to a locator                                        |
| `I scroll to "testid=preferences"`                 | Scroll a locator into view                                     |
| `I fill the form:`                                 | Fill inputs from a selector/value data table                   |
| `I hover "role=button:Help"`                       | Hover a locator                                                |
| `I double click "testid=item"`                     | Double-click a locator                                         |
| `I clear "label=Search"`                           | Clear an input                                                 |
| `I upload "fixtures/avatar.png" to "label=Avatar"` | Upload a feature-relative file                                 |
| `I drag "testid=task" to "testid=column"`          | Drag an element to another element                             |
| `I reload the page`                                | Reload for persistence checks                                  |
| `I go back` / `I go forward`                       | Navigate browser history                                       |

### Check the result

| Phrase                                                              | Effect                                 |
| ------------------------------------------------------------------- | -------------------------------------- |
| `"role=heading:Settings" is visible`                                | Retry a visibility assertion           |
| `"role=status:Result" has text "Saved"`                             | Retry an exact text assertion          |
| `"testid=loading" is hidden`                                        | Assert hidden or detached state        |
| `"role=button:Save" is enabled` / `is disabled`                     | Assert control state                   |
| `"label=Notifications" is checked` / `is unchecked`                 | Assert checkbox state                  |
| `"label=Name" has value "Demo"`                                     | Assert an input value                  |
| `"testid=tasks" contains text "Launch"`                             | Assert a substring                     |
| `"css=.task" has count 3`                                           | Assert the match count                 |
| `"role=button:Save" has attribute "aria-pressed" with value "true"` | Assert an attribute                    |
| `the URL is "/settings"`                                            | Assert exact URL relative to `baseURL` |
| `the page title is "Settings"`                                      | Assert the document title              |

### Write instructions and take screenshots

| Phrase                                         | Effect                                            |
| ---------------------------------------------- | ------------------------------------------------- |
| `I explain "Select Save."`                     | Add user-facing prose to the chapter              |
| `I add a prerequisite "Sign in as an editor."` | Add a descriptive chapter prerequisite            |
| `I add a note "Only your profile changes."`    | Add an informational callout                      |
| `I add a tip "Use a recognizable name."`       | Add a tip callout                                 |
| `I add a warning "Review before saving."`      | Add a warning callout                             |
| `I capture "Settings"`                         | Capture and optionally annotate the current state |

Only `I explain:` (plain-text docstring), `I capture "…"` (JSON object docstring) and `I fill the form:` (two-column data table) accept attached arguments. Built-in chapters need at least one capture. Validation catches invalid shorthand, URLs that cannot resolve against `baseURL`, and counts outside the safe integer range before browser actions. Trusted plugins define and validate their own steps and may take screenshots.

Use the environment-fill step for credentials. Its failure message names the variable without retaining the browser's fill log. Explicitly mask the field if the value can appear in screenshots.

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
        "color": "#e11d48"
      }
    ]
  }
  """
```

| Option                           | Behavior                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `marks[].kind`, `color`          | `box` (default), `arrow` or `both`. Colors use six-digit hex codes.                                                                                                                                                                                                                                           |
| `label`, `caption`, `autoLabels` | Labels contain 1–4 ASCII letters or digits and must be unique per capture. Captions become legends. Captioned marks get numbers by default; choose `"letters"` or `"numbers"` to label all marks automatically. Explicit labels take precedence. Older captions without labels remain unchanged when rebuilt. |
| `marks[].from`                   | Optional arrow origin, such as `{"x":64,"y":72}`, within the final screenshot. Automatic origins try to avoid other marked controls.                                                                                                                                                                          |
| `fullPage`                       | Default `false`: scroll the first mark into view and require all marks to fit. Use `true` to capture the document from its origin. Viewport crops on zoomed mobile pages account for the visual viewport.                                                                                                     |
| `focus`, `padding`               | Crop around one visible element with 24 CSS pixels of padding by default (0–500 allowed). Marks must fit in the crop. See the [focused capture example](advanced.md#capture-a-specific-panel).                                                                                                                |
| `masks`                          | Mask these targets in addition to the global config masks. Original and annotated PNGs come from the same masked image.                                                                                                                                                                                       |

Each privacy selector must match after the page settles. If its match count or bounds change while the browser takes the screenshot, neither image is saved. Review both variants for any private information your masks did not cover. Font and animation-frame waits honor `timeoutMs`. Motion is paused for measuring; previously paused animations stay paused. Boxes, arrows and labels are drawn onto the captured image.

## Authoring tools

See the [authoring guide](authoring.md) for editor setup, chapter templates, lint diagnostics and outline review. `lint`, `outline` and `validate` do not execute browser steps.

## Reports and failures

Each execution writes a separate run directory. Read `report.json` for the exact selection, browser, profile, viewport, chapter and step results, durations, errors and screenshots. Captures include relative PNG paths, dimensions, annotation bounds and image hashes. Feature paths are absolute in a local run. The [report schema](../schemas/report.schema.json) is version 1.

| Result          | What to open                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Passed          | `index.html`, `handbook.md` or `handbook.pdf` (when PDF export is enabled). Keep the screenshots beside them.           |
| Failed scenario | The report names the chapter and failed step or setup error. Available captures are retained; no handbook is published. |
| Export failure  | Read `exportError`. A PDF audit, if present, is diagnostic rather than a finished handbook.                             |
| Preflight error | Fix the reported config, feature or argument. The browser has not run.                                                  |

In `--json` mode, completed results go to stdout, including failed runs with exit code 1. Exceptions go to stderr with exit code 1. Plugin console diagnostics go to stderr; plugins should not write directly to stdout.

HTML and Markdown use the complete screenshot. PDF may split a tall figure across pages; `pdf-layout.json` records page count, warnings and exact slice ranges. Check the pages and legends visually, especially when a tall annotation spans slices. Standard PDF fonts cover common Latin text; the template has no configurable font embedding for other scripts.

## Evidence integrity

Readers check the report's schema and consistency. A passing chapter has passing steps and at least one capture. A passing run has no errors or skipped executions. Screenshot IDs and paths must be unique, labels distinct within each capture, and marks inside the image.

Rebuild, inspection, compare and portable exports verify screenshot dimensions, PNG decoding and available hashes. Current runs record SHA-256 for both images; 0.1 runs have no raw hash. `renderManual` and `renderPdf` verify images as well. Contained reads reject paths or symlinks outside the run; limits are 2 MiB for reports/layout and 64 MiB for images/manuals. The unsigned report establishes file consistency, not independent proof of origin. See [compare and inspect](customization.md#inspect-and-compare-evidence) for how to interpret changes.
