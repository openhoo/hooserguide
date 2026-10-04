---
name: hooserguide-development
description: Develop, debug, and verify hooserguide itself, including authoring tools, BDD execution, screenshot annotations, handbook exports, MCP, and CI integrations. Use in a hooserguide source checkout.
---

# Develop hooserguide

Work from the hooserguide source root. Read `AGENTS.md` and `CONTRIBUTING.md`;
current source, package scripts, lockfile and CI take precedence over this guide.
Agents using the tool in another application should use `hooserguide-author` or
`hooserguide-review` instead. Those skills are bundled separately for consumers.

## Find the change

| Area                                  | Implementation                                                                        | Verification                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| CLI and initialization                | `src/cli.ts`, `src/scaffold.ts`                                                       | CLI contract tests, installed-package smoke                                 |
| Writing tools and editor assets       | `src/authoring.ts`, `src/authoring-scaffold.ts`                                       | `test/authoring.test.ts`, consumer install                                  |
| Gherkin, built-in steps and preflight | `src/gherkin.ts`, `src/steps.ts`, `src/preflight.ts`, `src/runner.ts`                 | Background/Outline/plugin and preflight tests                               |
| Config, profiles, layouts and schemas | `src/config.ts`, `src/types.ts`, `scripts/build-assets.mjs`                           | Config rejection tests; rebuild generated schemas                           |
| Capture, labels and geometry          | `src/capture.ts`, `src/annotations.ts`, `src/pdf-slices.ts`                           | Real PNG pixels, high DPI/scroll/focus, both masked variants                |
| HTML, prose, themes and PDF           | `src/render.ts`, `src/viewer.ts`, `src/themes.ts`, `src/pdf.tsx`                      | Browser behavior plus rendered PDF review                                   |
| Evidence and re-exports               | `src/report.ts`, `src/evidence.ts`, `src/build.ts`, `src/compare.ts`, `src/bundle.ts` | Tampering, containment, failed-state and legacy tests                       |
| MCP                                   | `src/mcp.ts`                                                                          | Actual stdio clients, strict schemas, cancellation and pinned run selection |
| Responsive execution                  | `src/responsive.ts`, `src/runner.ts`                                                  | Complete scenario/profile groups and per-screen evidence                    |
| CI and Pages                          | `src/gitlab.ts`, `src/pages*.ts`, `templates/`, `actions/`                            | Installed component/action shells; native platform proof separately         |

## Work and verify

Node.js 22 or newer is required. `npm ci` runs the build through `prepare`.
Install the browsers needed by the affected tests:

```sh
npm ci
npx playwright install chromium firefox webkit
```

Start with the affected behavior and a focused test. For substantive code changes,
run `npm run check`, `npm test` and `npm run build`. Browser/capture/viewer changes
also need `npm run test:browsers`; package, scaffold, skill distribution and
component/action changes need `npm run test:package`. Check formatting with
`npm run format:check` and skill contracts with `npm run test:skills`.

Read [verification.md](references/verification.md) for focused commands, install
checks and how to distinguish local smoke tests from live deployment evidence.
Read [evidence-contracts.md](references/evidence-contracts.md) before changing
execution success, capture geometry, masking, report readers or exporters.

## Keep the interfaces aligned

- Public options and phrases must agree across TypeScript, runtime validation,
  CLI help/flags, MCP schemas, generated JSON schemas, examples and consumer skills.
  Built-in argument checks belong in shared preflight rather than only a handler.
- `lint` and `outline` are authoring plans with `executed: false`. They can load
  trusted plugin registration, but must not execute handlers or launch a browser.
  Respect selection and original Gherkin source locations, including Backgrounds,
  Rules and Outline rows. A plugin may produce captures that static lint cannot see.
- Editor and chapter scaffolds use exclusive writes. Preserve existing consumer
  files, keep config-relative paths consistent and install only consumer skills
  through `init --skills`.
- The build cleans `dist` before compilation and regenerates schemas. Do not
  hand-edit schemas or let obsolete modules enter a package.
- Preserve the pinned MIT notices for `src/pdfcn/`. Compose the guide in project
  code; adapt vendored components only when the change requires it.

## Documentation and skill changes

Keep the two audiences distinct: this skill supports tool development; the author
and review skills support work in consuming applications. Consumer references
must travel with their installed skill, with no source-checkout-only links.
Keep `.agents/skills/hooserguide-development` a relative discovery link to the
canonical skill under `skills/`.

For skill-only edits, validate metadata, references, routing and an actual fresh
installation. Do not rebuild screenshots or replay application workflows unless
the changed contract requires that evidence. For changed examples or rendering,
generate authorized local evidence and inspect the actual PNG/HTML/PDF artifacts.
The committed demo can be refreshed with `npm run demo:docs`; this also sanitizes
machine-specific source paths. Keep private content and `output/` out of commits.

Report the actual changed behavior, gates run and remaining limitations. A local
passing build, CI job or prepared Pages directory does not establish a release,
native GitLab acceptance or a live deployed guide.
