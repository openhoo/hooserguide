# Authoring reference

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

If an environment-fill step fails, its diagnostic identifies the environment
variable and omits the browser's fill error log, which can expose escaped or
abbreviated credentials. Check the selector, input state and variable availability
without printing the value. The step does not automatically mask a filled input;
configure screenshot masks wherever that value remains visible.

Use `focus: "testid=panel"` and `padding: 40` for a cropped screenshot of one form or dialog. `padding` defaults to 24; marks must fit inside the crop and arrow origins are crop-relative. Focus and fullPage cannot be combined. `autoLabels: "letters"` or `"numbers"` fills missing references while preserving explicit ones; duplicate references fail. Captioned marks without labels receive numeric references even without `autoLabels`. If badges crowd the screenshot, use more focus padding or split the capture.

Mark kinds are `box`, `arrow` and `both`. Labels accept 1–4 letters or digits. Colors use `#RRGGBB`; optional `from: {x, y}` sets arrow origins in screenshot CSS pixels. `fullPage: true` captures long pages and splits them into readable PDF images. For viewport screenshots all targets must fit together; split the capture when they do not. Locators can be strings (`role=button:Save`, `label=Name`, `text=Done`, `testid=save`, `css=.save`) or JSON objects (`{"role":"button","name":"Save"}`).

Gherkin Backgrounds, Scenario Outlines, Examples and language directives are compiled by the Cucumber parser. Built-in step text stays English even when Gherkin keywords are localized. Custom step modules export `register(registry)` and may use `context.page`, `context.target`, `context.capture`, `context.instruction` and the original `context.step`.
