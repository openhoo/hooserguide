# Review responsive presentations

Use for side-by-side or stacked mobile/tablet/desktop manuals.

1. Read `report.responsive.profiles` and every execution chapter's `variant`: scenario index, profile, label, browser, CSS viewport and scale factor. Require all selected profiles for each scenario and distinct pairs. Matching titles alone do not prove the same execution; compare source and feature. Reject missing variants or mismatched capture sequences.
2. The manual groups scenario/profile chapters for presentation; MCP capture indices refer to separate execution chapters in the report. Pin the exact `runId` and review raw plus annotated captures for every requested profile.
3. Check real responsive controls, privacy masks, high-DPI alignment and reference legends independently at each size. A desktop resize is not mobile evidence. Narrow browser emulation does not establish physical device behavior.
4. Open HTML at wide and narrow reader widths. Comparison captions should align, narrow layouts should stack without horizontal overflow, image links should open the active annotated/raw variant, and all legends should follow the raw toggle. Screen-specific instructions and callouts must remain available.
5. Render PDF overview and individual detail pages. The overview preserves complete images and provides profile labels; readable detail pages retain device labels, legends and annotation-aware slices. `stacked` omits overview pages. Check actual viewport metadata separately from the reader/PDF layout.
6. Failed/cancelled variants yield evidence only. Inspect omitted `skippedScenarios[].profile` entries and never call an incomplete group verified. Rebuild changes layout from old evidence; it does not rerun any device. Comparison and ZIP exports must retain profile identity and screenshot hashes.
