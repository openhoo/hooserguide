# Inspect screenshots and final formats

## Read each picture twice

Use the pinned run and, for MCP, the one-based **execution** chapter and capture indices. Open the masked original and the annotated image at the same scale. Start at the size a reader actually gets in HTML or on a PDF page; zoom in to diagnose a problem. For each figure:

| Inspect           | Failure to look for                                                                                                                                                                                            | Useful repair                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw state         | A spinner, stale toast, browser/dev overlay, open menu, hover tooltip or sticky header obscures the target; the frame shows the previous or next action.                                                       | Capture after an assertion for the intended state, dismiss an unrelated overlay, or change the capture point. Keep a toast or menu if it is the outcome being taught.                                               |
| Framing           | The focused crop cuts off the panel title that distinguishes two similar controls; a full-page screen leaves the only relevant text too small to read.                                                         | Include enough surrounding context to orient the reader. Use a focused detail or separate overview when it helps; compare at the same delivery size after recapture.                                                |
| References        | A badge sits on the value the reader needs, a box surrounds two controls, or an arrowhead lands on an adjacent row. Dark app colors swallow the arrowhead; at a narrow viewport a badge extends past the crop. | Trace each badge to its control and back to its legend. Compare the unobscured raw state. Move the leader side, adjust its length/stroke or color, increase crop padding, or split competing marks.                 |
| Legends and prose | The caption mentions B but the relevant mark is A; an arrow appears red but its legend swatch is blue; labels make sense only by color.                                                                        | Check letters/numbers, colors and exact UI words in both display and print. Automatic labels must be unique in the capture and avoid explicit labels. Legacy unlabelled marks must not acquire invented references. |
| Privacy           | Masked form text reappears in the header, list, toast or another profile; a mask hides the chosen value needed to follow the lesson.                                                                           | Check both variants at each actual viewport. Use safe representative data or mask all affected surfaces while preserving enough context for the task. See [reader-review.md](reader-review.md) for non-image leaks. |

## Follow the HTML as a reader

Open the actual delivered HTML at desktop and narrow widths. Tab from the top through reader controls and chapter navigation to the last chapter. Check visible focus, long labels, overflow, and whether a narrow image link opens a legible full-size view. Search for a match and then a term with no matches. Switch to original screenshots and verify the images **and image links** show the masked raw variant and annotation legends disappear.

In readers with **Open image**, test the figure at fit and actual size. Tab to the image area, pan with arrow keys, then press Escape. Check that focus returns to the figure you opened and that its caption, profile and visible legend still match the chosen raw or annotated image.

Check the theme picker and PDF download before the title: the theme persists on reload when storage is available, controls remain readable and print uses a light palette. Use the download and verify its bytes match the reviewed PDF; a visible link does not prove delivery. Without JavaScript the complete guide and PDF download should remain available, the interactive picker hidden. A guide intentionally exported without PDF should omit the download.

Try both native browser print and the Print button with an active search: all chapters, including offscreen screenshots, should appear. Browser printing and the downloadable PDF are separate outputs.

## Walk every PDF page

Render the delivered PDF, including its cover, contents and continuation pages. For example, from the run directory use Poppler to render a private local copy:

```sh
review_dir=$(mktemp -d)
pdftoppm -scale-to 1600 -png handbook.pdf "$review_dir/page"
```

Open the pages in page order. A contact sheet finds suspicious pages quickly; inspect full pages at reading size. Use `pdf-layout.json` slice ranges and warnings to locate possible seams. On newer exports, the audit checks the PDF against that record’s digest (`pdfHashVerified`). Check both files belong together before interpreting any reported page count. A figure with one recorded slice can still overflow: inspect the following physical page for orphaned legend rows. In a landscape guide the screenshot and entry A fit, but entries B and C moved to an otherwise empty page even though the slice audit passed.

- Check the first and last line of each page. Look for clipped accents, headings stranded above a footer, unexpected empty pages, missing instructions, overlapping footer content, and legends separated from their figure without a readable reference.
- For scroll captures, compare each slice's top and bottom with the next page and the original. Look for omitted or repeated controls and a badge, tip or target split across a seam. A very tall annotation group may need a separate focused capture even when all pixels are present.
- Read the smallest meaningful control and verify the letter-to-control mapping at ordinary viewing size. For responsive layouts check the screen label and see whether a detail page resolves a small overview. Mark a problem only if the reader loses information or orientation.
- Check that contents entries, links and figure continuation labels lead to the intended chapter, profile and page. Check page dimensions against requested geometry. For accessibility requests inspect heading roles in the tag tree and figure alternatives for titles, screen labels and continuation parts. These checks alone cannot establish PDF/UA conformance.

Report which figures, profiles and physical pages were inspected. If a renderer or a requested artifact is unavailable, record precisely what remains unverified.
