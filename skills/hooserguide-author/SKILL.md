---
name: hooserguide-author
description: Generate verified user manuals with hooserguide from Gherkin BDD scenarios, Playwright screenshots and pdfcn PDF exports. Use for documenting real application workflows with annotated screenshots and reference legends.
---

# Author a hooserguide manual

Use hooserguide's deterministic execution and export tools while you discover the real application and write its workflow instructions. The tool has no embedded model: you are the agent authoring the specs.

## Find or initialize the project

Look for `hooserguide.config.json`. Use the existing configuration and output location when present. Otherwise run:

```sh
hooserguide init docs/user-guide --base-url http://localhost:3000 --skills
```

If the command is unavailable, locate the hooserguide checkout or install the package from `github:openhoo/hooserguide`. Browser setup is `npx playwright install chromium` in that checkout or consumer project. Use a test account and authorized data-changing workflows. A request to document an app does not authorize publishing the handbook or changing unrelated production data.

## Inspect and write

Inspect actual UI controls with the browser tools available in the session. Write one user task per scenario. Prefer accessible names or stable test IDs over coordinates. Do not invent selectors or controls.

Run `hooserguide steps --json` or call MCP `hooserguide_steps` to discover supported phrases. Add `--config` to include domain plugins.

The config uses `title`, `baseURL`, `features` (file paths or globs), `output`, optional `tag`, `language`, `storageState`, `masks`, `viewport`, `plugins`, optional `profiles` / `profile`, and `branding` (`name`, `subtitle`, hex `accentColor`). Paths are relative to the config file. PDF is enabled by default and uses pdfcn / Forme.

Built-in steps:

- `I open "/path"`
- `I click "role=button:Save"`
- `I fill "label=Name" with "Example"`
- `I fill "label=Password" from env "APP_PASSWORD"`
- `I select "high" in "label=Priority"`
- `I check "label=Notifications"` / `I uncheck "label=Notifications"`
- `I press "Enter" on "label=Search"`
- `I scroll to "testid=preferences"`
- `"role=status:Save result" has text "Saved"`
- `"role=heading:Settings" is visible`
- `I explain "Select Save and check the confirmation."`
- `I capture "Settings"` with the JSON docstring below.

Additional actions include `I fill the form:` with a `selector | value` data table, `I hover`, `I double click`, `I clear`, `I upload "fixtures/avatar.png" to "label=Avatar"`, `I drag "testid=task" to "testid=column"`, `I reload the page`, `I go back` and `I go forward`. Upload paths are relative to the feature file. Additional assertions check hidden, enabled/disabled, checked/unchecked, input value, contained text, count, attributes, page title and URL; discover exact phrases through the catalogue.

Use `I explain` for clear user-facing instructions. Internal action steps remain in `report.json`. Assert the actual saved outcome before describing the operation as successful; a click alone is insufficient.

```gherkin
@manual
Feature: Account settings
  Update your display name and check the saved result.

  Scenario: Change your display name
    Given I open "/settings"
    When I fill "label=Display name" with "Demo User"
    And I click "role=button:Save"
    Then "role=status:Save result" has text "Saved"
    And I explain "Enter your display name, select Save and check the confirmation."
    And I capture "Saved settings"
      """json
      {
        "description": "Reference A identifies the name field; 1 shows the confirmation.",
        "masks": ["testid=email"],
        "marks": [
          {"target":"label=Display name","kind":"box","label":"A","caption":"Your display name."},
          {"target":"role=status:Save result","kind":"both","label":"1","caption":"The save completed."}
        ]
      }
      """
```

Remove or adapt example privacy selectors to the actual app. Missing masks fail closed. Global config `masks` apply to original and annotated captures. Never put credentials directly into feature files; use environment-fill steps or a local ignored `storageState`.

Use `focus: "testid=panel"` and `padding: 40` for a cropped screenshot of one form or dialog. `padding` defaults to 24; marks must fit inside the crop and arrow origins are crop-relative. Focus and fullPage cannot be combined. `autoLabels: "letters"` or `"numbers"` fills missing references while preserving explicit ones; duplicate references fail.

Mark kinds are `box`, `arrow` and `both`. Labels accept 1–4 letters or digits. Colors use `#RRGGBB`; optional `from: {x, y}` sets arrow origins in screenshot CSS pixels. `fullPage: true` captures long pages and splits them into readable PDF images. For viewport screenshots all targets must fit together; split the capture when they do not. Locators can be strings (`role=button:Save`, `label=Name`, `text=Done`, `testid=save`, `css=.save`) or JSON objects (`{"role":"button","name":"Save"}`).

Gherkin Backgrounds, Scenario Outlines, Examples and language directives are compiled by the Cucumber parser. Built-in step text stays English even when Gherkin keywords are localized. Custom step modules export `register(registry)` and may use `context.page`, `context.target`, `context.capture`, `context.instruction` and the original `context.step`.

## Execute and deliver

```sh
hooserguide validate --config docs/user-guide/hooserguide.config.json --json
hooserguide run --config docs/user-guide/hooserguide.config.json --json
```

Choose a named profile with CLI `--profile mobile` or MCP `{profile: "mobile"}` when documenting responsive workflows. `init` supplies desktop/mobile profiles; existing configs need their own profiles. Each profile run is separate.

With MCP, call `hooserguide_validate`, then `hooserguide_generate`. The server uses the config selected at startup. Call `hooserguide_inspect_capture` with one-based chapter/capture indices to see the actual annotations.

Fix undefined steps, failed assertions and export errors before delivery. Each run has an isolated directory. `status: failed` does not produce a successful handbook. On success review the PNGs, HTML and rendered PDF pages; check references, privacy masks, wrapping and long-page boundaries. Deliver the PDF/HTML/Markdown paths plus concise coverage and limitations. Do not claim workflows that were not executed.

## Re-export existing evidence

For document branding or export changes, use `hooserguide build <run-directory> --output output/rebuilt --config hooserguide.config.json --json`, or MCP `hooserguide_rebuild` for the latest successful run. Rebuild verifies screenshot hashes/dimensions and successful evidence, creates a new directory, and does not open the app. The original capture timestamp is retained with `rebuiltAt` and `sourceReportSha256`. Describe the output as a rebuild of existing evidence, not a fresh application check. Original images from 0.1 lack raw hashes; annotated hashes remain required.
