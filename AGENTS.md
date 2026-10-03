# Working on hooserguide

This is a TypeScript CLI/library for evidence-backed user manuals. The agent authors Gherkin, Playwright executes it, image annotations are composited with Sharp, and pdfcn / Forme produces the PDF.

- `npm ci` builds the package; install browsers with `npx playwright install chromium firefox webkit`.
- Verify substantive changes with `npm run check`, `npm test`, `npm run build`.
- Run `npm run test:browsers` for browser changes and `npm run test:package` for package/component changes.
- Keep runtime validation, JSON schemas, README examples and skills consistent.
- Failed steps, missing privacy masks and export failures must never publish a successful handbook.
- Preserve CSS-pixel alignment at device scale factors above 1 and after scrolling.
- Keep original and annotated screenshots equally masked.
- Use real screenshot and rendered PDF review for annotation/layout changes.
- `src/pdfcn/` is pinned MIT-licensed third-party source. Preserve the license and notices.
- Do not commit `output/`, credentials, storage state, local absolute paths or private app content.
- See `skills/hooserguide-author` and `skills/hooserguide-review` for application-documentation tasks.
