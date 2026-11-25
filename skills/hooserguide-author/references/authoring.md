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
        "description": "Reference A identifies the name field; B shows the confirmation.",
        "masks": ["testid=email"],
        "marks": [
          {"target":"label=Display name","kind":"box","label":"A","caption":"Your display name."},
          {"target":"role=status:Save result","label":"B","caption":"The save completed.","leader":{"side":"auto","length":72}}
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

Use `focus: "testid=panel"` and `padding: 40` for a cropped screenshot of one form or dialog. `padding` defaults to 24; marks must fit inside the crop and arrow origins are crop-relative. Focus and fullPage cannot be combined. `autoLabels: "letters"` or `"numbers"` fills missing references while preserving explicit ones; duplicate references fail. Without `autoLabels`, marks with `leader` get letters and other captioned marks get numbers. If badges crowd the screenshot, use more focus padding or split the capture.

Mark kinds are `box`, `arrow` and `both`. Labels accept 1–4 letters or digits. Colors use `#RRGGBB`; optional `from: {x, y}` sets arrow origins in screenshot CSS pixels. `fullPage: true` captures long pages and splits them into readable PDF images. For viewport screenshots all targets must fit together; split the capture when they do not. Locators can be strings (`role=button:Save`, `label=Name`, `text=Done`, `testid=save`, `css=.save`) or JSON objects (`{"role":"button","name":"Save"}`).

If the control has a large hit area around a small icon, prefer a locator for the visible icon when one exists. Otherwise adjust **that mark**. On a 44 × 44 pixel button, `"padding": -12, "offset": {"x": 4}` selects a 20 × 20 pixel region four pixels right of the original center. Another option, `"padding": {"left": -4, "bottom": 3}`, insets only the left edge and extends the bottom edge. Positive `x` moves right; positive `y` moves down. Numbers are in screenshot CSS pixels from −2000 to 2000, including fractions. Omitted axes/edges are zero. The marking uses the adjusted region before outline clearance or arrow placement; a fixed `from` stays in final screenshot coordinates.

The adjustment leaves the measured `bounds`, raw pixels, focus crop and privacy masks intact. Reduce an inset that collapses the region; if it extends outside a crop, adjust the mark or increase the capture's focus padding. If an adjustment newly overlaps a previously separate marked control, reduce it or choose a more precise target. Other controls can still be obscured, particularly on narrow screens. After an authorized run, compare both image variants: the badge, tip or outline should identify the exact same control on each requested profile. Check that nearby labels and values remain readable on the rendered PDF.

For a compact icon or a status with text, use `leader` to connect the letter
badge to its target. Keep the same reference in the caption legend and prose.
With `leader`, omit `kind` or use `arrow` for the arrow alone; use `both` only
if an outline helps. Choose `left`, `right`, `top` or `bottom` to fix the
badge side relative to the target, or `auto` to try several. `length` measures
from the badge rim to the tip in screenshot CSS pixels (default `72`). Start
with `width: 2`, `headSize: 9`, `head: "filled"`; try `width: 1`, `headSize: 6`,
`head: "open"` for a finer arrow or `width: 3.5`, `headSize: 12`, `head: "filled"`
for a bolder one. Use `from` for an exact badge center, without `leader.side`
or `leader.length`. If placement fails, use a clear side, shorten the arrow,
increase focus padding or split the capture. Check each profile in the
annotated image and rendered PDF at normal reading size.

Gherkin Backgrounds, Scenario Outlines, Examples and language directives are compiled by the Cucumber parser. Built-in step text stays English even when Gherkin keywords are localized. Custom step modules export `register(registry)` and may use `context.page`, `context.target`, `context.capture`, `context.instruction` and the original `context.step`.

Built-in chapters need a capture. Preflight checks selector shorthand across
steps, form rows and captures; it does not prove that a native selector matches
the app. A custom step can take a screenshot even if no built-in capture appears
in the outline. Privacy masks must match after the page settles and stay in place
while the browser takes each screenshot.
