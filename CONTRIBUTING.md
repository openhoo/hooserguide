# Contributing

Use Node.js 22 or newer. Install dependencies with `npm ci` and the test browser with `npx playwright install chromium`. `npm run check`, `npm test` and `npm run build` must pass before submitting a change.

For bug reports, include the tool version, browser, viewport, minimal feature/config and the failing step. Remove credentials, cookies, authentication state and private screenshot content. Do not include production account data.

Keep the CLI, TypeScript API, schemas and agent skills aligned. Verify actual PNG/PDF output for annotation or layout changes. Add meaningful regression coverage for coordinate errors, false success, privacy masking or export failures.

Pdfcn source is pinned in `THIRD_PARTY_NOTICES.md`. Preserve its MIT license when adapting components. Keep `src/pdfcn/` changes focused and identify any adaptations in the notices.

The committed demo is generated from `examples/tasks.feature`. Regenerate it with `npm run demo:docs`; that script also removes machine-specific source paths. Review the actual images and PDF before committing refreshed media.

Contributions are licensed under Apache-2.0 for original project code. Existing third-party files retain their original licenses.
