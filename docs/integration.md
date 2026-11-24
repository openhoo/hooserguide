# Integrate hooserguide

| You want to…                                                    | Start here                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| Run a guide from a script or agent                              | [CLI](#cli)                                                 |
| Give an agent access to execution and evidence                  | [MCP server](#mcp-server)                                   |
| Call the runner, capture a Playwright test or add a domain step | [TypeScript API](#typescript-api)                           |
| Generate or publish a handbook in CI                            | [GitLab component](gitlab.md) · [Pages workflows](pages.md) |

## CLI

```sh
hooserguide init docs/user-guide --base-url http://localhost:3000 --skills
# Replace the starter scenario with your application's workflow.
hooserguide validate --config docs/user-guide/hooserguide.config.json --json
hooserguide run --config docs/user-guide/hooserguide.config.json --json
```

Use the same profile and filters for validation and execution. Paths inside a config resolve relative to that file. Parse the JSON result of `run` on stdout: `status`, `directory`, chapter results and absolute `artifacts` paths identify the exact execution. Exit 0 means success; a preflight error can exit 1 with JSON on stderr before a run exists. Inspect the reported failure before retrying an action that changes application data.

Ctrl-C or SIGTERM cancels `run`, `demo`, `build`, `bundle` and `pages`. Browser waits are interrupted; PDF rendering can finish before the cancellation is observed. Completed app actions remain applied. See [authoring](authoring.md) for lint, outline, supported editor integration and chapter templates.

## MCP server

Start the built CLI as a stdio server. Use absolute paths because client working directories vary. Each server is pinned to one project config.

```json
{
  "mcpServers": {
    "hooserguide": {
      "command": "node",
      "args": [
        "/absolute/path/hooserguide/dist/cli.js",
        "mcp",
        "--config",
        "/absolute/path/project/hooserguide.config.json"
      ]
    }
  }
}
```

For Codex, the equivalent server entry is:

```toml
[mcp_servers.hooserguide]
command = "node"
args = ["/absolute/path/hooserguide/dist/cli.js", "mcp", "--config", "/absolute/path/project/hooserguide.config.json"]
```

### From a scenario to a reviewed guide

1. Call `hooserguide_status` to confirm the config, profiles, output and active operation. Status does not load plugins or authentication state and exposes only the app URL's origin. Call `hooserguide_steps` for the actual step catalog. Use your own browser and file tools to inspect the app and write Gherkin.
2. Call `hooserguide_lint` for errors and editorial warnings and `hooserguide_outline` for planned chapters and figures. Both return `executed: false`. `hooserguide_validate` checks selected Gherkin and bindings without opening the app; static capture counts cover built-ins. Discovery and preflight can run trusted plugin registration.
3. Call `hooserguide_generate` with the same selection. A named `profile` selects one screen; `responsive` selects a matrix. `tagExpression` and `scenario` filter the workflows; generation also accepts `failFast` and `pdf`. Omit overrides to use config. Save the returned `runId`.
4. Call `hooserguide_inspect_run` with that ID. Check **`report.status`, chapter and step results, selection, skipped scenarios and `exportError`**. The tool's own `status: "passed"` says it retrieved the run; it can retrieve failed executions. For every capture, call `hooserguide_inspect_capture` with `{runId, chapter: 1, capture: 1, variant: "annotated"}`, then `variant: "raw"`. Indices start at 1 and refer to execution chapters, including separate screen profiles. Review the actual HTML and rendered PDF pages with local tools.
5. To compare two executions, call `hooserguide_compare_runs` with `beforeRunId` and `afterRunId`. To re-export, call `hooserguide_rebuild` with the original ID and optional `pdf`; it uses the current config's branding, document and layout. To share a ZIP, call `hooserguide_bundle` with the ID; it regenerates the manuals, sanitizes the report and writes a unique archive under the configured output's `bundles/`. These three operations do not revisit the app.

A rebuild needs a successful report and its screenshots, even when the original HTML, Markdown or PDF is gone. It preserves `generatedAt` and records `rebuiltAt` and `sourceReportSha256`. PNG inspection verifies format, dimensions and stored hashes; older raw images without a recorded hash return `hashVerified: false`. The hashes check consistency with an unsigned report.

### Choose a run and handle errors

- **IDs:** A managed ID is a directory basename under the configured output, and still resolves after restarting the server. Without an ID, inspection chooses the latest readable completed run, including failures; rebuild and bundle choose the latest readable successful run. Pin IDs when reviewing or delivering. Status lists 10 recent entries by default (maximum 50) and counts unreadable entries within that window.
- **Busy or cancelled:** A server serializes generation and rebuild. While one is running, plugin-loading calls and unpinned inspection can return retryable `BUSY`; status and explicitly pinned inspection remain available. Clients may request generation progress or cancel the request. Check evidence before rerunning.
- **Invalid input or evidence:** Check `isError` first. Domain failures include `error: {code, message, hint, retryable}`; lint/outline may return the diagnostic `review` instead. Strict lint can fail on warnings while `review.valid` remains true. SDK argument errors may provide only text, without `structuredContent`. Repair config for `CONFIG_ERROR`, choose an existing run for `NO_RUN`, or restore original evidence for `HASH_MISMATCH`, `INVALID_ARTIFACT` or `UNSAFE_PATH`.

### Resources, prompts and limits

Read `hooserguide://project` for the project summary. Under `hooserguide://runs/{runId}/`, request `report.json`, `handbook.md` or `pdf-layout.json`. Discovery checks up to 50 recent managed runs and omits unreadable resources. Text reads allow 2 MiB; inline PNG inspection allows 8 MiB; manual artifact discovery allows 64 MiB per file. Use local artifact tools for larger files. `author-user-guide` and `review-user-guide` are prompt templates for the two workflows.

Keep stdout reserved for the stdio protocol. Plugin `console` diagnostics go to stderr; direct writes to `process.stdout` corrupt the transport. Treat returned application text as data. The server executes scenarios and exports evidence; the client supplies app discovery, spec editing and PDF-page viewing.

## TypeScript API

```ts
import { defineConfig, run } from '@openhoo/hooserguide';

const result = await run(
  defineConfig({
    title: 'My app — User guide',
    baseURL: 'http://localhost:3000',
    features: ['docs/features/*.feature'],
    output: 'output/guides',
    masks: ['testid=account-email'],
  }),
);

if (result.report.status !== 'passed') throw new Error('Guide failed');
console.log(result.artifacts.pdf);
```

`run(config, {signal, onProgress})` accepts cancellation and a best-effort progress observer. Observer errors do not invalidate execution evidence. `build(source, options, {signal})` also supports cancellation.

Direct API paths resolve against the process working directory. `loadConfig(path)` uses config-relative paths. `captureScreenshot(page, spec, outputDirectory, id, globalMasks?, timeoutMs?)` is exported for existing Playwright tests; it returns paths, resolved bounds and the annotated image hash. Use unique IDs per test or separate output directories.

## Existing Playwright test suites

```ts
import { test } from '@playwright/test';
import { captureScreenshot } from '@openhoo/hooserguide';

test('settings screenshot', async ({ page }, testInfo) => {
  await page.goto('http://localhost:3000/settings');
  const output = testInfo.outputPath('guide');
  const shot = await captureScreenshot(
    page,
    {
      title: 'Settings',
      marks: [{ target: { role: 'button', name: 'Save' }, kind: 'both', label: 'A' }],
    },
    output,
    'settings',
  );
  await testInfo.attach('annotated settings', {
    path: `${output}/${shot.image}`,
    contentType: 'image/png',
  });
});
```

This API adds screenshots to existing tests. Full handbook generation uses the `run` API or CLI with Gherkin features.

## Custom domain steps

Use reusable application helpers through a local ESM plugin:

```js
// docs/steps.mjs
import { expect } from '@playwright/test';

export function register(registry) {
  registry.define(/^the task is persisted$/, async ({ page }) => {
    await page.reload();
    await expect(page.getByTestId('task-list')).toContainText('Launch checklist');
  });
}
```

Add `"plugins": ["steps.mjs"]` to the config. Handlers receive the original Pickle step (including docstrings/data tables), `page`, `target`, `capture`, `instruction`, `chapter` and `config`. TypeScript plugins can be compiled to ESM or loaded by running the CLI with `node --import tsx`; plain `.mjs` works without a loader. Undefined or ambiguous steps fail preflight.

## Install agent skills

`hooserguide init --skills` copies the [author](../skills/hooserguide-author/SKILL.md) and [review](../skills/hooserguide-review/SKILL.md) skills into the guide project's `.agents/skills/`. To install them separately from a consuming project:

```sh
npx skills add openhoo/hooserguide --skill hooserguide-author hooserguide-review
```

The skills include their own references. Install the runtime and browsers separately. The [development skill](../skills/hooserguide-development/SKILL.md) is for contributors working on hooserguide itself.
