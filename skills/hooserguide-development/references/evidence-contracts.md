# Execution and evidence contracts

## Success is shared across interfaces

`src/report.ts` owns strict report parsing and successful-evidence consistency.
`src/evidence.ts` owns contained reads, managed run selection and PNG checks.
Runner publication, direct renderers, rebuild, inspection, comparison, bundle and
Pages preparation must preserve these contracts. A failed step, missing privacy
mask, incomplete responsive group or exporter failure cannot publish a successful
handbook. Failed runs may retain diagnostic evidence.

Runs stage into isolated directories and publish into unique run folders. Cleanup
must not delete an earlier run or an unrelated existing destination. A successful
report has passing chapters/steps, required captures, no recorded errors and no
skipped execution. Duplicate image references and contradictory statuses fail.

## Screenshots and geometry

Raw and annotated images originate from the same explicitly masked buffer. Mask
targets must match; missing targets fail closed. Both variants carry hashes in
current reports. Capture is not automatic personal-data detection.

Measurement and compositing use screenshot CSS pixels. Preserve scrolling,
viewport origin, full-page origin, focus padding and mobile visual-viewport
transformations at high DPI. Do not draw annotations into the application's DOM.
Motion freezing must retain previously paused animations. Reference labels are
unique per capture and annotation bounds must fit the image.

PDF slicing must cover every screenshot pixel while keeping annotation groups
together when possible. Legends belong beside the slice containing their target;
long captions/instructions must paginate without dropped or off-page text.

## Reads and re-exports

Contained artifact readers reject escaping paths and symlinks, validate schemas,
enforce read limits and verify available hashes and image dimensions. Preserve
explicit limitations for legacy evidence without raw hashes; do not invent proof.
Hashes against an unsigned report are consistency checks, not independent origin
authentication.

Rebuilds use old screenshots without revisiting the app. Preserve original
`generatedAt`, add `rebuiltAt` and `sourceReportSha256`, and keep old runs intact.
Comparison ignores step timing and image encoding while comparing decoded pixels,
prose, execution, tags and browser metadata. Bundles allowlist intended artifacts
and sanitize source paths; they exclude credentials, config and executable plugins.

## MCP and cancellation

The server is pinned to one config. Run selection reads persisted outputs and
survives restart; explicit `runId` stays authoritative. Inspection retrieval
success is separate from the inspected run's execution status. Return structured
failures and strict schemas; SDK argument errors can have only text.

Generation/rebuild serialization and cancellation must clean resources and retain
failure evidence without exposing successful cancelled exports. Already completed
app mutations remain applied. Do not automatically retry data-changing workflows.
Trusted plugins can log during import/registration: keep diagnostics away from
machine-readable CLI stdout and MCP protocol stdout.

## Profiles and publication

Each scenario/profile execution has independent contexts, assertions, screenshots
and masking. Presentation grouping must not merge execution evidence. Complete
responsive groups need unique profile membership and compatible capture sequences.

Pages regenerates static output from verified successful evidence, confines fresh
output, sanitizes local source paths and preserves provenance. CI artifacts are
scoped to the intended run/job; uploading the whole output parent can leak stale
or unrelated files. Generation authorization and external delivery authorization
are distinct. Prepared files and uploads are not a live deployment.
