# Visual review reference

## Inspect real visuals

Open annotated PNGs and compare them with the masked `.raw.png` originals. If using MCP, `hooserguide_inspect_capture` returns either variant (`annotated` or `raw`) with verified metadata; pin `runId` for one-based chapter/capture indices.

For focused screenshots check the crop includes the intended region and references remain correctly positioned. Automatic references must be unique, skip explicit labels and agree with every legend. Check that per-mark colors match their legend entries.

Confirm each box surrounds the intended control, each arrow reaches its target and every letter/number agrees with the prose legend. Check references near screenshot edges, on scaled mobile pages and after animation changes. Captioned marks receive painted numeric references; legacy captures without labels must not acquire invented references in their legends. Inspect the exact slice ranges in `pdf-layout.json`; very tall groups may still span pages. Labels and captions should stay readable without hiding essential state.

Look for personal data in both original and annotated files. Config `masks` and capture `masks` affect both. Missing selectors fail closed, but the absence of a mask does not prove the app contains no private data. Avoid dumping private screenshot text or credentials into reports.

Open the generated HTML at desktop and narrow widths. Check chapter navigation, focus, image sizing and escaped prose. Render the PDF to images with available PDF tooling, inspect its cover and all content pages, and verify screenshot slices preserve the full content at readable scale. Do not treat extracted text as evidence of correct layout.
