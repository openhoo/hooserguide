# Make your first user guide

hooserguide turns a Gherkin scenario into a manual with annotated screenshots. Playwright carries out your steps and checks their assertions. When the run passes, open the HTML or PDF path printed by the CLI.

Open the [live example handbook](https://openhoo.github.io/hooserguide/) to see the reader, annotated captures, and downloads.

## Try a complete example

With Node.js 22 or newer:

```sh
git clone https://github.com/openhoo/hooserguide.git
cd hooserguide
npm ci
npx playwright install chromium
npm run demo
```

The demo runs a local task app and needs no account or API key. You can also read the [example PDF](../demo/handbook.pdf), download the [offline ZIP](../demo/handbook.zip), or inspect the [scenario that produced them](../../examples/tasks.feature).

## Document your own app

1. From your application project, run `npm install -D github:openhoo/hooserguide#0.10.0` and `npx playwright install chromium`.
2. Start your app. Run `npx hooserguide init docs/user-guide --base-url http://localhost:3000 --editor` with its actual URL.
3. Edit `docs/user-guide/features/get-started.feature`. Describe one reader task, assert its outcome, and capture the result. Use the [authoring walkthrough](../authoring.md#write-the-readers-instructions-alongside-the-workflow) and [step reference](../reference.md#built-in-step-phrases).
4. Run `npx hooserguide lint --config docs/user-guide/hooserguide.config.json`, then `npx hooserguide run --config docs/user-guide/hooserguide.config.json`. The second command performs the actions in the scenario; use a test account and data you can change.
5. Review the guide and its masked screenshots. Keep the screenshot directory beside the HTML and Markdown files, or [bundle a portable ZIP](../customization.md#share-a-portable-zip).

## Find a workflow

| I want to…                                              | Read                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Find a selector, add annotations or mask private fields | [Selectors and capture options](../reference.md#capture-docstring)                                            |
| Make desktop, tablet and mobile guides                  | [Responsive presentations](../responsive.md)                                                                  |
| Adjust a PDF or reuse an existing run                   | [Manual themes](../customization.md#manual-themes) · [Rebuild](../advanced.md#rebuild-from-existing-evidence) |
| Connect an agent or call the TypeScript API             | [Integrations](../integration.md)                                                                             |
| Generate in CI or publish a static handbook             | [GitLab component](../gitlab.md) · [Pages](../pages.md)                                                       |
| Diagnose a failed run or missing export                 | [Troubleshooting](Troubleshooting.md)                                                                         |
| Change hooserguide itself                               | [Architecture](../architecture.md) · [Review evidence](../review.md) · [Contributing](../../CONTRIBUTING.md)  |
