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
