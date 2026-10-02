# Integrations

## CLI for any agent

`--json` produces one machine-readable summary with `status`, an isolated run `directory`, absolute `artifacts` paths and per-chapter status. Success exits 0; failed scenarios, invalid configuration or export errors exit 1. Human progress and errors do not pollute JSON stdout. Preflight errors are written as JSON to stderr.

```sh
hooserguide init docs/user-guide --base-url http://localhost:3000 --skills
hooserguide validate --config docs/user-guide/hooserguide.config.json --json
hooserguide run --config docs/user-guide/hooserguide.config.json --json
```

Config paths resolve against the config file, so these commands work from another directory. Feature patterns are expanded deterministically and duplicate paths are deduplicated. Every selected scenario must contain a screenshot. Use `tag: "@manual"` to select documentation scenarios. Gherkin has Backgrounds, Outlines, Examples, tags, Rules and localized keywords; built-in step text is English.

## MCP: Codex, Claude Code, Cursor and other clients

Add a stdio server using the built CLI and an absolute project config path:

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

| Tool                          | Purpose                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `hooserguide_steps`           | List built-in and custom step patterns, descriptions and examples                                                  |
| `hooserguide_rebuild`         | Re-export the latest successful run (retained even after a newer generation fails) without opening the application |
| `hooserguide_validate`        | Parse features and check every step and capture definition without opening the browser                             |
| `hooserguide_generate`        | Run authorized workflows; export PDF, HTML, Markdown and evidence                                                  |
| `hooserguide_inspect_capture` | Return the latest run's screenshot and metadata to the agent for visual review                                     |

Generation and validation accept an optional `profile` argument. Rebuild accepts an optional `pdf` boolean and uses current config branding. The `author-user-guide` MCP prompt explains the authoring workflow. The agent uses its existing browser/file tools to inspect the target and write feature files. Hooserguide has no embedded LLM or provider credentials. The MCP server is pinned to one local config and refuses overlapping generation runs. Step plugins are trusted executable code. Generation can mutate the target app according to the spec, so the MCP tool advertises that behavior.

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

## CI

Install browsers in CI, start the target app and run the CLI. Upload the isolated output directories even on failure for diagnosis:

```yaml
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npm exec hooserguide -- run --config docs/hooserguide.config.json --json
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: user-guide
    path: output/guides
```

## Skills

`hooserguide init --skills` copies both skills into the project's `.agents/skills/`. To install them globally, copy `skills/hooserguide-author` and `skills/hooserguide-review` from this repository into your agent's skill directory, for example `~/.codex/skills/`. Other clients can read the same `SKILL.md` instructions. See [author skill](../skills/hooserguide-author/SKILL.md) and [review skill](../skills/hooserguide-review/SKILL.md).
