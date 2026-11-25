# Reader copy, evidence and delivery

## Read one task as its intended reader

Start at the chapter heading with only the delivered handbook open. Identify the reader's starting role/screen, action, and visible sign of completion. Then trace those three things to the executed chapter and actual images. Look for these defects:

| Symptom in the manual                                                                                       | How to check and repair                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “Click here”, “use the option above”, “the green button” or “select Save” when two Save buttons are visible | Cover the screenshot and read the sentence. Name the visible control and, where needed, its panel: “In Workspace preferences, select Save preferences.” Keep a number/letter as a supplement to the name.                                                            |
| A new screen or prerequisite appears between two numbered steps                                             | Compare reader instructions with the action sequence. If the missing navigation, permission or prefilled data is essential, name it before the first dependent action. Don't turn test-only setup into a user step.                                                  |
| A result is stronger than the assertion                                                                     | A success message after selecting Save supports “look for the confirmation.” “Your choice is kept after you reopen settings” needs a check after reopening. “Everyone is notified” needs separate evidence. Narrow the claim or add the appropriate assertion.       |
| Each sentence is plausible, but the sequence misleads                                                       | Check before/after figures against their capture position in the step list. Look for a warning shown after the consequential action, a prefilled example masquerading as an empty initial screen, or a screenshot that illustrates a different role.                 |
| A caption says how the manual was built                                                                     | For an end-user guide, replace “references are assigned automatically” or “long screenshots span PDF pages” with the decision this figure helps the reader make. Keep these explanations when the guide actually teaches handbook authoring.                         |
| Placeholder copy, selectors, fixture IDs, mixed language or stale names                                     | Read the title, instructions, figures and legends in context; compare the exact words on the UI. “TODO”, a TODO-list item, and a control genuinely named “TODO” have different meanings. Browser locale and label translation alone do not translate authored prose. |
| The chapter has several near-identical screenshots                                                          | Compare their purpose, not just their pixels. Two views with different targets may both be useful. Remove or combine a figure only when it adds no decision, new state or necessary orientation.                                                                     |

Check parity wherever the same claim appears: numbered instructions, warnings, legends, captions and destination links in HTML, Markdown and PDF. In Markdown, open relative image links from the extracted guide directory and check that rendered list ordering and multiline text remain understandable.

## Inspect privacy in what gets delivered

A mask changes PNG pixels. It does not redact the recorded step text, selectors, typed values, app errors, figure descriptions, legend captions or report metadata. Inspect those in the exact delivered report and manuals as well as both image variants. When a ZIP or site is requested, inspect its actual file list and downloadable artifacts; a clean HTML preview does not establish that the report or raw toggle is safe to share.

If a private value is present, identify its artifact and location without reproducing it. Withhold the affected copy from delivery. Prefer synthetic fixtures and narrower approved capture content, or correct masking as appropriate. Generate replacement evidence and check every affected surface. Moving the text into a caption or covering an annotated PNG alone leaves other copies intact.

## Write a finding someone can fix

Example (illustrative): **Fix before acceptance — Notifications / mobile, step 3, PDF p. 6.** The caption promises the setting will persist. The only check follows the toggle, before Save. The reader has no verified way to recognize a saved setting. Assert the saved value after reopening the panel and rerun that profile, or narrow the text to the result actually shown. Check the revised instructions and figure in each delivered format.

When the discrepancy only affects presentation, identify that boundary: “Raw and annotated PNGs show the entire label; PDF p. 6 trims its right edge.” That points to a page layout repair and an evidence-only rebuild. If the raw PNG itself is clipped, repair the capture instead.
