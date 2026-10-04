# CI and GitLab evidence

Use this reference when generating or reviewing a manual through CI.

## Browser coverage in the consuming application

Hooserguide supports Chromium, Firefox and WebKit. Its own qualification tests
verify synthetic capture/export workflows, not the consuming app's browser
coverage. Choose the actual browser/profile in the consumer config and validate
and execute the selected application workflows. Install the selected browser
through the consumer's Playwright dependency. Firefox uses a narrow viewport
without `isMobile`; Chromium/WebKit support mobile emulation. Source-checkout
qualification belongs to `hooserguide-development`, not this consumer workflow.

## GitLab generation

The `generate` component is `templates/generate/template.yml`. From GitHub, use a pinned remote include. A native `component` include requires hosting the repository on the same GitLab instance as the consuming project. Do not describe a GitHub-hosted template as a published GitLab catalog entry.

Inputs include config/output, browser/profile, base-url, tags/scenario, pdf/bundle/fail-fast, page-size/orientation/margin, readiness URL/timeout, setup commands/services, job dependencies/rules and artifact retention. Empty profile/selection fields keep config defaults; browser, PDF and fail-fast inputs explicitly override them. Keep config/auth/plugin paths config-relative. Use authorized test environments and masked/protected CI variables for credentials; never put credentials in component inputs.

Use unique job names and output directories for multiple includes. The artifact root must be relative to the checkout. Each job creates and uploads a fresh job-ID folder; previous jobs and other files in the root are excluded. The adapter refuses job-directory collisions and escaping paths. The package is installed separately from app dependencies. With a custom image, match the Playwright browser version or enable browser installation.

## Review artifacts

Download the artifact archive and read `summary.json`. Its directory/artifact paths are relative to the project checkout (the artifact extraction root); pin the indicated run rather than selecting the newest directory. Require summary status and report/chapters/steps to pass. Review actual masked raw/annotated PNGs, HTML and rendered PDF pages exactly as for local runs.

Failed jobs retain available reports and screenshots but do not create a successful handbook or ZIP. Pre-execution/install/output failures can occur without a run directory. Readiness checks prove the endpoint responds, not that workflows or authentication succeed. Job success proves only the recorded browser/profile/filter selection. A portable ZIP sanitizes source paths; hashes are still relative to an unsigned report.

Retain failed evidence for diagnosis and avoid automatically repeating data-changing workflows. GitLab Pages or other external publication is a separate action requiring the user's existing authorization. Do not infer catalog publication or native pipeline success from local template tests or GitHub CI.
