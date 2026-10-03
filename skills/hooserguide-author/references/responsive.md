# Responsive feature presentations

Use when the user wants the same feature shown on Mobile, Tablet and Desktop, in comparison columns or stacked views.

- Define two to four named `profiles` with viewport and optional emulation/browser settings. `init` supplies desktop/tablet/mobile examples. Enable `responsive: { profiles: ["desktop", "mobile"], layout: "side-by-side", labels: { desktop: "Desktop", mobile: "Mobile" } }` or pass CLI `--profiles desktop,mobile`. Layout can be `stacked`.
- Validate and generate with the same responsive profile order and scenario/tag filters. MCP accepts the `responsive` object in both tools. Single `--profile` overrides a configured comparison; combining single and multiple selection is an error.
- Each scenario runs independently in every selected profile. Browser contexts are fresh, but backend changes persist. Check authorization and arrange reusable test data or a trusted reset step for scenarios that create records; do not automatically replay failures.
- Write stable capture titles in the shared scenario. Capture count/order/title must match across screens. Use stable selectors or trusted custom steps for breakpoint-dependent controls. Each capture resolves its own annotations and masks at its own viewport.
- Firefox rejects `isMobile`; use a narrow viewport or another engine. Recorded CSS viewport and scale factor describe browser emulation, not a verified physical device.
- HTML groups execution chapters and adapts its comparison columns to the reader width. PDF provides an overview plus readable individual detail pages. Use `manual.screenLayout` or `--screen-layout` to rebuild a different layout from existing successful evidence.
- Reports retain each execution chapter with `variant.profile` and `variant.scenario`; pin `runId` and inspect actual execution chapter indices. Deliver coverage for all requested profiles and review every masked raw/annotated variant.
- GitLab inputs `profiles` and `screen-layout` provide the same selection; its `browser` overrides every profile engine. A failed variant prevents a successful combined manual.
