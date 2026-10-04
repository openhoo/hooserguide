# Review in a consuming project

Skills installation supplies this review workflow and all its references. It does
not install hooserguide, browsers or PDF-rendering tools. Do not require a source
checkout or fetch repository internals just to review a delivered handbook.

## Find the runtime and exact evidence

Use the guide directory or run ID returned by generation or identified by the
user. A delivered ZIP should contain a report, intended manuals, both masked image
variants and a manifest; inspect its extracted contents. Do not substitute an
unrelated latest run for the requested one.

If the consuming project has hooserguide installed:

```sh
npm exec hooserguide -- --help
npm exec hooserguide -- inspect /path/to/exact/run --json
```

Without a runtime, use available file/image/PDF tools to inspect the exact report,
hashes and rendered artifacts. If installation is needed, the supported project
source is `github:openhoo/hooserguide`, with Node.js 22 or newer; use the consumer's
existing package manager and pin a verified release when reproducibility matters.
An npm registry release is not assumed. Offline evidence inspection does not
require browser installation; generation does.

For MCP, use the consumer's installed binary with `mcp --config <absolute-config>`.
Status identifies profiles and persisted run IDs; pin the selected ID on all
inspection/rebuild/compare calls. Check actual available tools before using a
feature from a newer build. The server returns reports and PNGs but does not
render PDF pages.

## Keep plans separate from evidence

Authoring `lint`/`outline` output has `executed: false`. It can support reviewing
source coverage and writing quality, but does not verify selectors, saved app
state, screenshot masking or export layout. Strict writing checks can fail on
warnings while the authoring plan remains `valid: true`.

Use actual execution reports and both image variants for handbook review. A
rebuild reuses old app evidence; a comparison describes differences between runs.
Review can repair prose/export settings within the task. Repeating app actions or
publishing externally requires the user's existing authorization for those actions.
