# Alignment and export review — 0.2.1

## Reproduced and corrected

| Case                                     | Original failure                                                      | Correction and evidence                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Mobile page without a viewport meta tag  | Screenshot pixels were scaled; annotation bounds were not             | Transform viewport bounds into raster coordinates; pixel tests cover viewport and full-page captures at DPR 2            |
| Paused finite Web Animation              | Screenshot fast-forwarded the control after its position was measured | Pause running Web Animations before measurement, preserve already paused animations, and capture without fast-forwarding |
| Dense controls                           | Reference badges collided and adjacent padded boxes overlapped        | Choose badge positions against all marked controls and previous badges; reduce padding between adjacent targets          |
| Image edge                               | Left clipping incorrectly increased the right edge of the box         | Calculate each clipped edge independently                                                                                |
| Explicit arrow origin                    | Origins close to image edges silently moved inward                    | Keep the requested origin; position the reference badge separately when necessary                                        |
| Four-character and pale-color references | Long text could escape circular badges; white text could disappear    | Use wider pill badges and contrasting reference text                                                                     |
| Caption with no label                    | Legend invented a numeric reference absent from the screenshot        | Assign numbers during capture; preserve legacy unlabeled captions without fabricated labels on rebuild                   |
| Long PDF captions                        | A flex row could paginate to an invalid off-page position             | Use native inline styled text runs; audit and extract text from a long-document regression export                        |
| PDF continuation pages                   | Arbitrary seams could divide marks and leave tiny tails               | Balance slices and move seams away from annotation groups where possible; place legends on matching slices               |
| Long mobile HTML content                 | Unbroken names and identifiers created horizontal overflow            | Allow text wrapping, shrink grid children and verify keyboard skip navigation at 320px                                   |
| CLI options                              | Unsupported command options silently did nothing                      | Reject irrelevant flags and document profile/output options                                                              |
| Invalid default profile                  | A valid CLI/MCP override was applied after config rejection           | Merge explicit overrides before validating the selected profile                                                          |
| Init conflicts                           | Existing skills or invalid URLs left partial project files            | Preflight skill directories and validate the URL before writing                                                          |
| Browser context setup                    | Invalid session state escaped chapter error handling                  | Publish a failed report and clean staging; do not expose a successful manual                                             |
| MCP rebuild after a failed generation    | The latest failed result displaced prior successful evidence          | Keep the latest attempt and last successful evidence separately                                                          |

## Visual evidence

![Actual browser captures before and after alignment fixes](media/alignment-review.png)

Reproduce from a full Git checkout with `npm run review:gallery`. The script executes the pinned 0.2.0 capture implementation and the current implementation against the same controlled browser fixtures. It writes temporary evidence under ignored `output/review/` and the comparison image under `docs/media/`.

Additional local WebKit checks cover desktop and zoomed mobile viewport/full-page captures at DPR 2, with raster pixels checked against the recorded bounds. The automated CI suite uses Chromium.

The demo screenshots, desktop/mobile HTML previews and rendered PDF previews are regenerated from actual BDD executions. The review also renders a document with 32 lengthy instructions, a long description and multi-paragraph legends to check pagination and text retention.

## Practical limits

Badge placement chooses available space among nearby candidates; a densely marked region may still require more padding or separate captures. It cannot guarantee empty space in an arbitrary screenshot. A group taller than a PDF image budget cannot fit wholly on one page, and page seams may cross unmarked application content. Review every exported page for the intended workflow.

Mobile profiles emulate browser settings. They do not replace physical-device verification. Annotation coordinates on a zoomed viewport describe the final screenshot, while full-page/focus crops use document CSS pixels.

Hashes detect screenshot changes against the supplied report; reports are unsigned. Offline rebuilds preserve the original application evidence and capture timestamp.

## 0.3.1 project-wide review

Reviewed the runner and publication path, capture/annotation geometry, report and config schemas, evidence loading, direct renderers, rebuild/comparison/bundle, CLI, MCP tools/resources, scaffold, packaging and agent instructions.

| Finding                                                                  | Repair                                                                                 | Regression evidence                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Readers could accept a passed report with failed or incomplete execution | Shared semantic report gate across readers/exporters, including empty error fields     | Invalid reports rejected by inspect, build, bundle and both direct renderers  |
| Rebuild used separate unbounded file reads                               | Shared size-limited, contained artifact and PNG verification                           | Oversized report/image and escaping report symlink rejected                   |
| Direct renderers trusted typed reports and screenshot paths              | Strict runtime schema plus hash/format/dimension checks for both PNG variants          | Tampered raw screenshot and external image URL rejected before export         |
| Comparison missed changed execution steps, tags and browser              | Compare execution text/status/errors, scenario tags and engine metadata                | Changed step/browser detected; timing-only change ignored                     |
| Recompressed annotated PNG counted as changed content                    | Compare normalized decoded pixels for both image variants                              | Recompression keeps chapter unchanged                                         |
| Plugin console diagnostics could corrupt CLI JSON stdout                 | Route diagnostics to stderr and emit CLI results explicitly on stdout                  | Noisy plugin subprocess returns parseable JSON; console restored after errors |
| Scaffold overwrite preflight had a race                                  | Exclusive creation of config and feature files                                         | Two concurrent initializations yield one intact winning config                |
| ZIP close failures bypassed archive cleanup                              | Close within the guarded write operation; best-effort cleanup preserves original error | Existing archive overwrite/cancellation integration coverage retained         |

Verification: 38 tests, TypeScript check/build, formatting, installed-tarball CLI/MCP/browser/PDF/rebuild/compare/inspect/bundle smoke test and both skill validators passed locally. Fresh English A4 portrait and German Letter landscape demos passed execution/export and their rendered PDF contact sheets were visually inspected, together with full-size annotation and PDF detail images. GitHub CI validates the published commit separately.

The schemas specify JSON shape; the shared semantic gate additionally enforces cross-field and cross-capture consistency. Hashes remain relative to an unsigned local report. Legacy raw files without hashes retain their disclosed verification limit. Chromium is exercised in CI; Firefox/WebKit are selectable but not part of the CI browser matrix.

## 0.4.0 browser qualification and GitLab component

Added a separate qualification suite and Linux CI matrix for Chromium, Firefox and WebKit. Each engine executes saved-state BDD workflows, high-DPI/scroll/focus geometry and pixel checks, both privacy-masked variants, narrow HTML search/toggle controls, pdfcn export, missing-mask failure and cancellation. Firefox uses a narrow viewport without mobile emulation; Chromium/WebKit exercise `isMobile`. The synthetic annotation comparison in the README was generated from these executed tests.

The GitLab `generate` component has typed inputs and literal variable transport, an isolated package install, config/profile/filter overrides, readiness polling, PDF layout controls, optional ZIP and structured failure summaries. Its artifacts are confined to the current job-ID folder under the configured root. Prior jobs and unrelated root files are excluded, while available failed-run evidence remains uploaded. Runtime checks reject escaping paths/symlinks and job-directory collisions before browser execution.

Local verification covers 46 main-suite tests and six browser qualification tests, strict YAML/input contracts, a three-include native self-test pipeline and execution of the actual packaged component shell against a real loopback app. The packed-package smoke test checks that relative `file:` package installation works, application dependencies are untouched, stale root content remains outside the job folder, and PDF/ZIP/summary artifacts exist. Both agent skills include CI-specific artifact review guidance. Build cleanup removes deleted/renamed compiled modules; a package sentinel regression prevents obsolete files from shipping in incremental builds.

Native GitLab CI Lint, runner execution and catalog publication require a target GitLab project and working authentication. They are not established by GitHub CI or the local template tests. A pinned GitHub remote include supports using the template before mirroring it to GitLab.

## Responsive presentations — 0.5.0

Responsive runs expand each scenario into independent named-profile executions. Reports preserve the scenario/profile identity, viewport, engine and device scale factor for each capture. All selected profiles and matching capture sequences are required for successful export. Per-screen guidance remains labelled and complete, and cancelled/fail-fast execution identifies omitted profiles.

HTML renders aligned comparison columns with full-image links and narrow-screen stacking; its annotation toggle also updates image links. Markdown uses comparison tables or stacked views. PDF renders complete comparison overviews plus readable single-screen details, keeping narrow images at a sensible scale and preserving annotation-aware slices. Offline rebuilds can change screen layout; compare, inspect and bundle preserve all variants.

Verification passed with 51 main-suite tests and all six browser qualification tests. It includes responsive Chromium BDD execution, masks and pixel alignment, incomplete/duplicate/mismatched evidence rejection, CLI/MCP/GitLab integration, profile-label inheritance, screen-specific guidance, PDF text and layout checks, raw-link switching and narrow-reader overflow checks. The existing six browser qualification tests now also execute Desktop/Mobile comparisons in Chromium, Firefox and WebKit. The package smoke executes the actual installed component shell with responsive profiles. Synthetic HooTasks and generated HTML/PDF screenshots provide visual review evidence.

## Pages automation — 0.6.0

GitLab Pages uses a separate default-branch job depending on exact generation artifacts and a single successful job summary. GitHub exposes isolated generation and Pages-upload actions plus a dependent Pages/OIDC deployment workflow. Shared preparation regenerates static HTML/PDF from verified successful evidence, copies only intended masked screenshots and exports, sanitizes local source paths and refuses stale/escaping targets. Relative links support project prefixes and custom domains.

Verification passed with 56 main-suite tests, workflow actionlint and package smoke executing the actual packaged GitLab generation/Pages shells and both GitHub action shells. Tests cover responsive evidence, PDF/ZIP downloads, sanitized reports, corrupt source exports regenerated from evidence, failed/hash-mismatched execution, unsafe paths, stale output, ambiguous job summaries and real browser loading under a project prefix. Browser qualification remains the existing six-engine tests; screenshot execution and annotation rendering are unchanged. Both agent skills include Pages guidance.

The repository's GitHub workflow publishes synthetic HooTasks evidence only after successful main-branch CI. Native GitLab runner/Pages verification requires working target-project authentication; local template/shell tests do not establish a deployed GitLab site or Catalog registration.
