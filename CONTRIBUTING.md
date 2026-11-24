# Contributing

Use Node.js 22 or newer. Install dependencies with `npm ci` and the test browsers with `npx playwright install chromium firefox webkit`. `npm run check`, `npm test` and `npm run build` must pass before submitting a change. Browser-related changes also require `npm run test:browsers`; packaging/GitLab component changes require `npm run test:package`.

For bug reports, include the tool version, browser, viewport, minimal feature/config and the failing step. Remove credentials, cookies, authentication state and private screenshot content. Do not include production account data.

Keep the CLI, TypeScript API, schemas and agent skills aligned. Verify actual PNG/PDF output for annotation or layout changes. Add meaningful regression coverage for coordinate errors, false success, privacy masking or export failures.

Pdfcn source is pinned in `THIRD_PARTY_NOTICES.md`. Preserve its MIT license when adapting components. Keep `src/pdfcn/` changes focused and identify any adaptations in the notices.

The committed demo is generated from `examples/tasks.feature`. Regenerate it with `npm run demo:docs`; that script also removes machine-specific source paths. Review the actual images and PDF before committing refreshed media.

Contributions are licensed under Apache-2.0 for original project code. Existing third-party files retain their original licenses.

## Contributor and consumer skills

Use [hooserguide-development](skills/hooserguide-development/SKILL.md) when working
on the tool. The source checkout discovers it through `.agents/skills`; the
canonical files live under `skills/hooserguide-development`.

The `hooserguide-author` and `hooserguide-review` skills serve agents working in
consuming applications. Keep their references self-contained and their commands
aligned with the shipped CLI/MCP. `init --skills` must not install the contributor
skill into a consumer guide project.

For skill changes, run `npm run test:skills` and verify an actual fresh install with
`npm run test:skills:install`. Packaging changes also require `npm run test:package`.
Avoid replaying browser workflows for skill-only prose changes.

## Maintain the GitHub Wiki

Edit the guides in `docs/`. The wiki home, sidebar and troubleshooting page live in `docs/wiki/`. The repository copies contain relative links for offline use; the wiki renderer converts them to links between wiki pages and to assets in the matching source revision.

```sh
node scripts/wiki.mjs --check
node scripts/wiki.mjs --output output/wiki-preview
```

The [wiki workflow](https://github.com/openhoo/hooserguide/actions/workflows/wiki.yml) publishes documentation changes from `main`. To inspect the published files or sync them manually, clone the wiki as a sibling repository:

```sh
git clone https://github.com/openhoo/hooserguide.wiki.git ../hooserguide.wiki
node scripts/wiki.mjs --ref "$(git rev-parse HEAD)" --output ../hooserguide.wiki
git -C ../hooserguide.wiki status --short
```

For manual publication, start from a clean, up-to-date wiki clone and a source commit already on GitHub. Review the diff before committing and pushing in the wiki clone. Edit generated pages in the main repository; independently authored wiki pages can coexist under other names.
