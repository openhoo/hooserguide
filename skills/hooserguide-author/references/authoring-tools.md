# Writing and iteration tools

## Scaffold and discover

`init --skills --editor` creates a dedicated `hooserguide.code-workspace`, local
config/capture schemas, all documented step snippets and authoring tasks. Open the
workspace in a VS Code-compatible editor with Gherkin language support. Existing
projects can use `editor --config <config>`; setup refuses to overwrite its files
and preserves existing settings/tasks. Tasks use the installed consumer package.

`new "Task title" --template task|form|read-only --config <config>` creates a new
feature beside the first feature pattern. `--output` is config-relative. Existing
features are never overwritten. Replace `REPLACE_ME` intros, prerequisites,
selectors and captions before executing. Confirm that configured feature patterns
select the new file. Task/form templates reload and assert the saved result;
read-only templates assert visible state.

`steps --search <term> --config <config> --json` searches documented phrases,
patterns and descriptions, including trusted plugins. MCP `hooserguide_steps`
accepts `{search}`. Suggestions and snippets are examples; use observed labels.

## Prose

A Scenario description overrides the Feature description for its chapter.
`I explain:` accepts a nonempty plain-text docstring, optionally marked `text`,
for one multiline instruction. Several `I explain` steps create separate numbered
instructions. Prose and prerequisites never assert application state.

Built-in attachments belong only on `I explain:` (text docstring), `I capture
"..."` (JSON object docstring) and `I fill the form:` (selector/value table).
Other built-in steps reject docstrings/tables before app actions. Malformed URLs
and counts outside the safe integer range also fail preflight. Trusted plugins
own validation of their custom arguments.

## Diagnostics and outline

`lint --config <config> --json` / `hooserguide_lint` collect syntax, binding,
argument and capture errors across files, plus editorial warnings about missing
prose/outcomes/descriptions, duplicates and placeholders. Feedback includes source,
line, column, severity, code, hint and optional similar step suggestions.
Background diagnostics retain original lines. Outline chapters reference their
Examples row; step diagnostics reference their definitions.

`outline --config <config>` prints a Markdown plan; `--json` and
`hooserguide_outline` return structured chapters, instructions, prerequisites,
figures, source locations, excluded chapters and planned profile counts.
Capture counts refer to built-in capture steps; trusted plugins can create
additional captures at runtime. A plugin chapter without built-in captures gets
a warning rather than a guaranteed-missing-capture error.

CLI accepts `--profile`, `--profiles`, `--tags`, `--scenario`. MCP accepts `profile`,
`responsive`, `tagExpression`, `scenario`. Keep these identical to validation/run.
Excluded chapters remain in the plan but receive no step/editorial diagnostics;
all configured files must still parse as Gherkin. Invalid configs or failing
plugins are exceptional errors, not ordinary per-step diagnostics.

Plans always contain `executed: false`. These tools never open the app, but
trusted plugin registration executes local code. `lint --strict` / MCP `{strict:
true}` fail on writing warnings as well as errors. `valid` means no authoring
errors and can remain true on a strict warning failure. MCP returns the report
under `review`; check `isError` and `status` before interpreting it. A plan cannot
replace execution or prove persistence, selector correctness or privacy.
