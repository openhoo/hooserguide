# Write and iterate on a guide

The authoring tools help you write a clear guide before executing application
workflows. An outline is a plan. Only a successful `run` creates verified
screenshots and a finished handbook.

## Start with an editor workspace

```sh
hooserguide init docs/user-guide --base-url http://localhost:3000 --skills --editor
```

Open `docs/user-guide/hooserguide.code-workspace` in VS Code or a compatible
editor. Existing projects can run:

```sh
hooserguide editor --config docs/user-guide/hooserguide.config.json
```

The workspace supplies:

- Local configuration and capture JSON schemas for completion and validation.
- `hg-` snippets for every documented built-in or trusted plugin step.
- `hg-chapter-task`, `hg-chapter-form` and `hg-chapter-read-only` snippets.
- Tasks for authoring lint, outline review, binding validation and generation.
- A problem matcher that puts lint errors and warnings in the Problems panel.

Use an editor with Gherkin language support for `.feature` snippet completion.
Capture schemas apply to standalone `*.capture.json` drafts; capture docstrings
inside Gherkin are checked by `lint` and `validate`. Copy the JSON into the capture
docstring when finished. No separate JSON file is loaded by a capture step.

Editor setup writes a dedicated workspace, a named snippet file and local schemas.
It refuses to overwrite any of these generated files and preserves existing
`.vscode/settings.json` and `.vscode/tasks.json`. Open the generated workspace to
activate its tasks and settings. Tasks use the consumer's installed package via
`npx --no-install hooserguide`; install hooserguide in the consumer project first.

## Create chapters from task templates

```sh
hooserguide new "Change notification settings" --template form --config docs/user-guide/hooserguide.config.json
hooserguide new "Find a report" --template read-only --config docs/user-guide/hooserguide.config.json
hooserguide new "Create a project" --template task --config docs/user-guide/hooserguide.config.json
```

The title becomes the scenario name and a file slug. The default destination is
the directory of the first configured feature pattern. `--output` chooses a
different `.feature` file, relative to the config directory. Globbed directories
require an explicit destination. The command does not change your config: ensure
its `features` patterns select the new file.

Templates contain `REPLACE_ME` introductions, prerequisites and exact selectors.
Replace them using the actual application. Task and form templates include a
reload and a saved-result assertion; read-only templates assert the page's visible
state. Existing feature files are never overwritten. Templates are unfinished
specifications, and lint reports their placeholder prose.

## Write the reader's instructions alongside the workflow

Use the Scenario description for that chapter's introduction. It overrides the
Feature description for the generated chapter; chapters without their own prose
inherit the Feature description. Backgrounds, Rules and Scenario Outlines retain
their normal Gherkin execution semantics.

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

`I explain:` accepts a nonempty plain-text docstring, optionally marked `text`.
It creates one instruction, retaining line breaks in the report, HTML, Markdown
and PDF. It
does not interpret Markdown or execute content. Use several `I explain` steps for
separate numbered instructions. Prerequisites and callouts remain descriptive;
assertion steps verify application state.

## Get all authoring feedback at once

```sh
hooserguide lint --config docs/user-guide/hooserguide.config.json
hooserguide lint --config docs/user-guide/hooserguide.config.json --strict --json
hooserguide steps --search capture
hooserguide steps --config docs/user-guide/hooserguide.config.json --search upload --json
```

Lint continues across files, chapters and steps. It reports errors for Gherkin
syntax, undefined/ambiguous bindings, malformed quoted arguments, form tables,
capture options, empty multiline instructions, missing screenshots and empty
selections. Undefined steps include up to three similar documented phrases.
Suggestions are examples; adapt their selectors to the actual app.

Editorial warnings flag missing instructions, introductions, outcome assertions,
figure descriptions, duplicate selected chapter titles and unfinished placeholder
prose. They help with writing quality; they cannot prove that a workflow persists
data, that an assertion is appropriate, or that all private information is masked.
Custom bindings registered under `Then` count as potential outcome assertions.
Plugins own validation of their own arguments. A chapter with custom steps and
no built-in captures receives a warning because plugins may capture screenshots.
Planned capture counts include built-in capture steps only.

Each diagnostic includes `source`, `line`, `column`, `severity`, stable `code`,
message and repair hint. Background steps point to their original lines. Outline
chapters point to their Examples row, while step diagnostics point to the step
definition. Parsing errors can report their line with a default column of 1.

Lint exits 1 for errors; `--strict` also exits 1 for editorial warnings. Completed
lint results go to stdout, including failing `--json` results. Config/plugin errors
use the CLI's existing stderr error contract. `valid` means no authoring errors;
it can remain true when a strict review fails due to warnings. No browser is
launched. Configured plugins are trusted code and execute during registration.

## Review the planned guide before execution

```sh
hooserguide outline --config docs/user-guide/hooserguide.config.json
hooserguide outline --config docs/user-guide/hooserguide.config.json --json
hooserguide lint --config docs/user-guide/hooserguide.config.json --profiles desktop,tablet,mobile
hooserguide outline --config docs/user-guide/hooserguide.config.json --tags "@manual and not @draft" --scenario "settings"
```

The outline shows introductions, instructions, prerequisites, figure descriptions,
annotation/mask counts, source locations and excluded chapters. It reports
planned executions and captures across selected profiles. JSON includes
`executed: false`, selection, totals, chapters and diagnostics. Excluded chapters
are listed but do not receive step/editorial diagnostics; Gherkin syntax must
still parse in every configured file. A missing-file pattern remains an error.

Default output is Markdown on stdout, so you can save a draft with shell
redirection. Invalid plans still produce the outline and exit 1. The authoring
outline is never accepted as a successful handbook or execution report.

Then validate and run the same selection:

```sh
hooserguide validate --config docs/user-guide/hooserguide.config.json --scenario "settings"
hooserguide run --config docs/user-guide/hooserguide.config.json --scenario "settings"
```

## Agent and library interfaces

MCP exposes `hooserguide_lint` and `hooserguide_outline` with `profile`, `responsive`,
`tagExpression`, `scenario` and optional `strict`. Both return a structured `review`
with the same authoring report as the CLI. Check `isError` and `status`; a strict
warning review has `status: failed` while `review.valid` can be true.
`hooserguide_steps` accepts an optional case-insensitive `search` substring.
MCP authoring tools do not write files or open the application.

```ts
import { loadConfig, lint, formatOutline, newChapter } from '@openhoo/hooserguide';

const review = await lint(await loadConfig('hooserguide.config.json'));
console.log(formatOutline(review));
await newChapter('hooserguide.config.json', 'Find a report', { template: 'read-only' });
```

The package also exports `formatDiagnostics`, `suggestSteps`, `chapterTemplate`,
`chapterTemplates`, `setupEditor`, and the authoring report/diagnostic types.
