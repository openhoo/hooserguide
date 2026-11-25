# Visual review reference

## Inspect real visuals

Open annotated PNGs and compare them with the masked `.raw.png` originals. If using MCP, `hooserguide_inspect_capture` returns either variant (`annotated` or `raw`) with verified metadata; pin `runId` for one-based chapter/capture indices.

For focused screenshots check the crop includes the intended region and references remain correctly positioned. Automatic references must be unique, skip explicit labels and agree with every legend. Check that per-mark colors match their legend entries.

Confirm each box surrounds and each arrow points to the intended control. Each reference must agree with the prose and legend. Check references near screenshot edges, on scaled mobile pages and after animation changes. Marks with `leader` get letters by default; other captioned marks get numbers. Legacy captures without labels must not acquire invented references in their legends. Inspect the exact slice ranges in `pdf-layout.json`; very tall groups may still span pages.

At normal reading size, follow each `leader` arrow from the badge rim to the
intended control. Check the masked original to confirm the tip and shaft leave
the target icon, text or state readable and do not cross a nearby control.
Verify that the head is easy to see and the same letter appears in the legend
on the rendered PDF page. If crowded, try a different side, length or stroke
width, or increase focus padding and check the new capture at every profile.

Look for personal data in both original and annotated files. Config `masks` and capture `masks` affect both. Missing selectors fail closed, but the absence of a mask does not prove the app contains no private data. Avoid dumping private screenshot text or credentials into reports.

Open the generated HTML at desktop and narrow widths. Check chapter navigation, focus, image sizing and escaped prose. Render the PDF to images with available PDF tooling, inspect its cover and all content pages, and verify screenshot slices preserve the full content at readable scale. Do not treat extracted text as evidence of correct layout.

Check chapter-specific introductions and multiline instructions against the
authored task. HTML, Markdown and PDF should preserve paragraph breaks in
multiline instructions. Compare actual rendered prose rather than only the report.

Find the theme selector and PDF download before the guide title. Verify the
selected theme is readable, survives reload when storage is available and switches
to light colors for printing. A reader theme change does not change the PDF file.
Without JavaScript, the PDF download remains available and the theme picker is
hidden. When no PDF was generated, the guide must not offer a broken PDF link.
Use the session's browser download tools to save the real file, confirm it is a
PDF and compare it with the exact reviewed export. A visible button or successful
navigation alone does not establish a working download.

For PDF accessibility, inspect the tagged structure as well as the rendered pages: headings should expose H1-H6 roles and screenshot figures should retain their titles, screen labels and continuation parts as alternative text. These checks do not establish full PDF/UA conformance. For long guides, confirm that the desktop contents list scrolls inside the viewport and its final link is reachable by keyboard. Check native browser printing as well as the Print button, including chapters hidden by search.
