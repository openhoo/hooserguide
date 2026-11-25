# Write and iterate on a guide

Write one scenario for one task a reader wants to finish. Describe the task in the reader's words, assert its outcome, and capture a screenshot that shows what success looks like. This page walks through editing, checking and running that scenario. For a ready-to-run example, see the [demo feature](../examples/tasks.feature).

## Start with an editor workspace

With hooserguide [installed in your application project](../README.md#document-your-app), run:

```sh
npx hooserguide init docs/user-guide --base-url http://localhost:3000 --editor
cd docs/user-guide
```

The remaining commands on this page run from this guide directory, beside `hooserguide.config.json`. Start your application at the configured URL before generation. For the first chapter, edit `features/get-started.feature`. Add `--skills` at initialization if an agent will author or review the guide.

Open `hooserguide.code-workspace` in an editor with Gherkin support. It provides local JSON schemas, `hg-` step and chapter snippets, tasks for lint, outline, validate and run, and lint diagnostics in the Problems panel. The capture schema works in standalone `*.capture.json` drafts; copy the JSON into a scenario's capture docstring to use it.

In a `.feature` file, choose `hg-capture-lettered-arrow` to insert a letter badge with a matching caption and a fine, open arrow. Tab through the side, length, stroke width and tip options. See the [arrow settings](reference.md#connect-a-reference-badge-to-a-control).

An existing guide can run `npx hooserguide editor` beside its config. Setup creates dedicated workspace, snippet and schema files and preserves existing editor settings and tasks. The workspace runs the project's installed CLI.

When reviewing a draft, lint also flags unfinished figure descriptions, captions without text, automation selectors in reader prose and a final interaction with no following assertion. A control named in a step can use `role=button:Save`; in a caption, call it **Save**. Custom steps may verify their own results: inspect their behavior before adding redundant assertions.

## Write the reader's instructions alongside the workflow

Here is a chapter for an account settings page. Replace the path, accessible names and privacy selector with the ones in your application. The reload and final assertion verify that the display name survived the save.

```gherkin
@manual
Feature: Account settings
  Manage the settings associated with your account.

  Scenario: Change your display name
    Choose the name your teammates see when you comment on a task.

    Given I add a prerequisite "Sign in to your account."
    And I open "/settings"
    Then "role=heading:Settings" is visible
    And I explain:
      """text
      Enter the name your teammates will recognize.

      Select Save, then check that your new name remains after reloading.
      """
    When I fill "label=Display name" with "Demo Editor"
    And I click "role=button:Save"
    And I reload the page
    Then "label=Display name" has value "Demo Editor"
    And I capture "Your saved display name"
      """json
      {
        "description": "Reference A shows the saved display name.",
        "marks": [
          { "target": "label=Display name", "label": "A", "caption": "Your saved name" }
        ],
        "masks": ["testid=account-email"]
      }
      """
```

A Scenario description introduces that chapter; otherwise it inherits the Feature description. Backgrounds, Rules, Scenario Outlines and localized Gherkin keywords work normally. `I explain:` creates one plain-text instruction from its docstring, including line breaks. Use separate `I explain` steps for separately numbered instructions. A prerequisite describes what the reader needs; an assertion checks what the app did.

Use the [step and selector reference](reference.md#built-in-step-phrases) for exact phrases and allowed arguments, and the [focused capture example](advanced.md#capture-a-specific-panel) for cropping and labels.

## Create chapters from task templates

```sh
npx hooserguide new "Change notification settings" --template form
```

Choose `task` for a general saved change, `form` for a table of inputs or `read-only` for a lookup. Replace the generated `REPLACE_ME` prose and selectors before running. The title becomes the scenario name and filename slug. The editor has the same three templates as `hg-chapter-…` snippets.

By default, the file goes in the directory of the first feature pattern. If that directory contains a glob, specify a filename with `--output features/example.feature`. Output paths are relative to the config. Existing files are preserved; make sure the config's `features` pattern includes the new file.

## Get all authoring feedback at once

```sh
npx hooserguide steps --search capture
npx hooserguide lint
```

`steps` searches examples, descriptions and patterns. Supply `--config hooserguide.config.json` to include trusted plugin steps. `lint` reads the configured files without running a browser. It reports all selected chapters' errors and warnings together, with a filename, line, column, diagnostic code and repair hint.

| Result                                                 | What to do                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Unknown or ambiguous step                              | Check the suggested phrases or register the intended plugin.                                                               |
| Invalid selector shorthand, argument, table or capture | Fix its syntax at the reported line. Native selectors can only be checked against the app when it runs.                    |
| No selected chapter or no screenshot                   | Check filters and add a capture. A custom step may supply a screenshot; lint warns when it cannot tell.                    |
| Editorial warning                                      | Check for missing instructions, introductions, outcomes, figure descriptions, duplicate titles or unfinished placeholders. |

For CI, `npx hooserguide lint --strict --json` exits 1 on warnings as well as errors. The JSON `valid` flag means zero errors. Completed reviews go to stdout even when invalid; config or plugin exceptions go to stderr. Background diagnostics point to their source steps; Outline chapters point to their Examples row. A parse error may use column 1.

The editor's `hg-capture-adjusted-mark` snippet inserts a capture with relative x/y offsets and separate left/right padding. Use it when the locator measures a larger area than the control you mean to highlight. Check the [mark geometry](reference.md#adjust-the-area-a-mark-points-to) against an actual capture; static validation cannot measure the UI.

## Review the planned guide before execution

After saving the example, use the same scenario filter for each command:

```sh
npx hooserguide outline --scenario "Change your display name"
npx hooserguide validate --scenario "Change your display name"
npx hooserguide run --scenario "Change your display name" --json
```

The outline shows prose, figures, mask counts, excluded chapters and planned executions. Its default output is Markdown; `--json` includes `executed: false`, the selection, totals and diagnostics. Counts cover built-in captures only. All configured files must exist and parse, even when their scenarios are excluded. An invalid outline still prints and exits 1.

`validate` checks selected steps and arguments. Only `run` opens the app and performs the actions; use a test account and data you can change. Open the HTML or PDF path returned by a passing run and inspect both screenshot variants. See [selection and fail-fast](customization.md#select-workflows-and-stop-on-failure) for tag filters and [responsive guides](responsive.md) for screen profiles.

## Agent and library interfaces

MCP exposes `hooserguide_lint`, `hooserguide_outline` and searchable `hooserguide_steps`. Authoring reviews accept profile and scenario/tag selections; their structured results distinguish `status` from `review.valid` when strict warnings fail. They do not write files or run steps, but configured plugin registration executes trusted local code. See the [MCP and library guide](integration.md).

```ts
import { loadConfig, lint, formatOutline, newChapter } from '@openhoo/hooserguide';

const review = await lint(await loadConfig('hooserguide.config.json'));
console.log(formatOutline(review));
await newChapter('hooserguide.config.json', 'Find a report', { template: 'read-only' });
```

The package also exports `formatDiagnostics`, `suggestSteps`, `chapterTemplate`, `chapterTemplates`, `setupEditor` and the authoring report types.
