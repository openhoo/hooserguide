# Advanced workflows

## Capture a specific panel

Focus screenshots improve readability when a full page contains navigation or unrelated information. The original and annotated images both contain only the cropped, masked region.

```gherkin
And I capture "Task form in detail"
  """json
  {
    "focus": "testid=task-form",
    "padding": 40,
    "autoLabels": "letters",
    "marks": [
      { "target": "label=Task title", "kind": "box", "caption": "Enter a descriptive title." },
      { "target": "role=button:Save", "kind": "both", "color": "#2563eb", "caption": "Save the task." }
    ]
  }
  """
```

`focus` must resolve to one visible element. `padding` defaults to 24 CSS pixels and accepts 0–500. Focus cannot be combined with `fullPage: true`; marks must fit in the final crop. Explicit arrow `from` coordinates are relative to the cropped image. The report records the crop's origin and dimensions in full-document CSS pixels.

The browser first captures a masked full-page buffer and Sharp extracts the desired region. This keeps coordinates consistent at high DPI and after scrolling; very large documents still have the browser's full-page capture limits.

`autoLabels: "letters"` generates A, B, … Z, AA, AB, …; `"numbers"` generates 1, 2, 3, …. Explicit labels are retained and skipped by the automatic sequence. Duplicate explicit labels fail validation. Numbers and letters are scoped to each screenshot, and captions become matching HTML/PDF/Markdown legends.

![Focused screenshot with automatically assigned references](demo/screenshots/01-03.png)

## Fill a form using a Gherkin table

```gherkin
When I fill the form:
  | selector | value |
  | label=Name | Demo User |
  | label=Email | demo@example.test |
Then "label=Name" has value "Demo User"
And "role=button:Save" is enabled
When I click "role=button:Save"
And I reload the page
Then "label=Name" has value "Demo User"
```

The header must be exactly `selector | value`, with at least one data row. Each row fills a text input. Use `I select`, `I check` or a custom step for other controls. For credentials use the environment-fill step instead of writing a secret in a table. Reload assertions are useful when documenting durable saved state rather than only an immediate UI confirmation.

Uploads resolve paths relative to the `.feature` file:

```gherkin
When I upload "fixtures/avatar.png" to "label=Avatar"
And I drag "testid=task" to "testid=done-column"
Then "testid=done-column" contains text "Launch checklist"
```

Hover, double-click, clear and browser-history actions are also available. Discover exact phrases with `hooserguide steps --json`; use `--config` to include custom plugins.

## Named browser profiles

```json
{
  "title": "My app — User guide",
  "baseURL": "http://localhost:3000",
  "features": ["features/**/*.feature"],
  "output": "output/guides",
  "profiles": {
    "desktop": { "viewport": { "width": 1280, "height": 800 } },
    "mobile": {
      "viewport": { "width": 390, "height": 844 },
      "deviceScaleFactor": 2,
      "isMobile": true,
      "hasTouch": true
    },
    "dark": { "colorScheme": "dark" }
  },
  "branding": {
    "name": "Acme",
    "subtitle": "Everything you need for your first day.",
    "accentColor": "#7c3aed"
  }
}
```

```sh
hooserguide validate --profile mobile
hooserguide run --profile desktop --json
hooserguide run --profile mobile --json
```

Each command executes a separate run. Profiles override the corresponding base viewport, scale factor and browser, while other base settings remain. Supported profile settings are `viewport`, `deviceScaleFactor`, `browser`, `isMobile`, `hasTouch` and `colorScheme`. Set config `profile` to choose a default. Unknown names fail before browser launch. `init` includes desktop and mobile profiles.

Firefox does not support `isMobile`; use a mobile viewport without that flag or select Chromium/WebKit. Install the selected browser first. Workflow selectors and viewport captures must accommodate the actual responsive UI. Full-page or focus captures can help when mobile layout moves controls apart. Profiles emulate browser settings; they are not physical-device tests.

The report records the selected profile, effective viewport and the duration of each executed step. Existing config without profiles continues to use its base browser settings.

## Rebuild from existing evidence

Re-export a successful run without opening the application:

```sh
hooserguide build output/guides/run-<timestamp>-<id> \
  --output output/rebuilt --config hooserguide.config.json --json
```

`--config` is optional; it reads branding from a complete project config. Other execution settings are not used and no feature files are rerun. `--no-pdf` exports only HTML and Markdown. Without `--output`, builds are saved under a sibling `rebuilt` directory.

The source report and screenshots remain untouched. Rebuild validates the report, successful chapter/step states, screenshot paths, image dimensions and annotated PNG SHA-256 values. Raw PNG hashes are checked when the source report includes them; 0.1 reports did not have raw-image hashes. Missing/changed images or symlinks escaping the source run fail the build. Hash checks detect changes against a trusted report; they do not authenticate an unsigned report.

The new report retains the original `generatedAt`, adds `rebuiltAt` and the SHA-256 of the source report. A rebuilt guide represents the original capture time; it does not claim that the application was checked again. Branding changes affect the document template, not the screenshot contents.

```ts
import { build } from '@openhoo/hooserguide';

const result = await build('output/guides/run-<timestamp>-<id>', {
  output: 'output/rebuilt',
  branding: { name: 'Acme', accentColor: '#7c3aed' },
});
if (result.report.status !== 'passed') throw new Error(result.report.exportError);
```

MCP clients call `hooserguide_steps` for the catalogue, pass `profile` to generation/validation, and call `hooserguide_rebuild` to export the latest successful run with current project branding. Rebuild does not require application access.
