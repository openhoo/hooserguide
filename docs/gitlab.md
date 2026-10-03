# GitLab CI/CD component

The `generate` component runs Gherkin workflows, creates masked and annotated screenshots, exports pdfcn PDF/HTML/Markdown and optionally packages successful evidence as a ZIP. Failures fail the job and preserve available execution evidence. It uses the same runner and verification gates as the CLI and MCP server.

## Use directly from GitHub

GitLab 17.0+ can include the template with inputs from a pinned remote URL. This works before hosting a copy in a GitLab namespace:

```yaml
stages: [test]

include:
  - remote: https://raw.githubusercontent.com/openhoo/hooserguide/0.6.0/templates/generate/template.yml
    inputs:
      config: docs/user-guide/hooserguide.config.json
      base-url: http://127.0.0.1:3000
      wait-url: http://127.0.0.1:3000/health
      before-script:
        - npm ci
        - npm run start > /tmp/hooserguide-app.log 2>&1 &
```

Adapt the start command and readiness endpoint to your application. The component uses a matching Playwright container with Node.js and all three browser engines. The consuming application is responsible for its own dependencies and startup. For a deployed test application, omit `before-script` and provide its URL. GitLab service containers can be supplied through `services`; use the service alias in `base-url` and `wait-url`.

The default package source is `github:openhoo/hooserguide#0.6.0`. Installation happens in a temporary directory, leaving the application's package manifest and lockfile intact. A matching browser image is pinned separately. Override both when changing the Playwright version, or set `install-browsers: true` with a custom Node.js 22+ Linux image. Installing system dependencies requires the appropriate container permissions.

## Use as a GitLab component

GitLab component references must point to a project on the **same GitLab instance** as the consuming project. Import or mirror this repository, including its version tag, into your namespace before using this form:

```yaml
include:
  - component: $CI_SERVER_FQDN/your-namespace/hooserguide/generate@0.6.0
    inputs:
      config: docs/user-guide/hooserguide.config.json
      browser: firefox
      base-url: http://test-app:3000
      wait-url: http://test-app:3000/health
```

The component is located at `templates/generate/template.yml`. A local include also works when the template is copied into the consuming repository:

```yaml
include:
  - local: /templates/generate/template.yml
    inputs:
      config: docs/user-guide/hooserguide.config.json
```

Hosting the repository on GitHub does not register it in the GitLab CI/CD Catalog. Catalog publication requires a GitLab project, enabling it as a catalog resource and publishing a semantic-version release through that project's pipeline. Follow GitLab's [component documentation](https://docs.gitlab.com/ci/components/) for the target instance. The repository's `.gitlab-ci.yml` provides a self-test pipeline for a GitLab import; it does not automatically enable catalog registration.

## Inputs

| Input                 | Default                                      | Purpose                                                                                                                       |
| --------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `job-name`            | `hooserguide`                                | Unique job name; change for multiple includes.                                                                                |
| `stage`               | `test`                                       | Must exist in the consuming pipeline.                                                                                         |
| `image`               | `mcr.microsoft.com/playwright:v1.63.0-noble` | Matching Playwright browsers and Node.js 22+.                                                                                 |
| `package`             | `github:openhoo/hooserguide#0.6.0`           | Pinned package source. `file:` paths resolve against the project checkout.                                                    |
| `config`              | `hooserguide.config.json`                    | Config path inside the checkout; feature/plugin/auth paths remain config-relative.                                            |
| `output`              | `output/hooserguide`                         | Relative artifact root; each job creates a fresh `job-$CI_JOB_ID` folder. Escaping paths/symlinks and collisions are refused. |
| `browser`             | `chromium`                                   | `chromium`, `firefox` or `webkit`; overrides the selected profile's engine.                                                   |
| `profile`             | empty                                        | Use the configured profile, or select a named profile.                                                                        |
| `base-url`            | empty                                        | Keep the configured URL, or override with an HTTP(S) test app URL.                                                            |
| `tags`                | empty                                        | Keep configured selection, or use a Cucumber tag expression.                                                                  |
| `scenario`            | empty                                        | Keep configured selection, or filter scenario names.                                                                          |
| `pdf`                 | `true`                                       | Explicitly enable/disable PDF export.                                                                                         |
| `bundle`              | `true`                                       | Create a portable ZIP for successful runs.                                                                                    |
| `fail-fast`           | `false`                                      | Explicitly stop/continue after failed scenarios.                                                                              |
| `page-size`           | `config`                                     | Preserve layout or choose `A4`/`Letter`.                                                                                      |
| `orientation`         | `config`                                     | Preserve layout or choose `portrait`/`landscape`.                                                                             |
| `margin`              | `0`                                          | Preserve configured margin, or use 24..72 points.                                                                             |
| `wait-url`            | empty                                        | Optional readiness endpoint. HTTP 2xx/3xx is ready.                                                                           |
| `wait-timeout`        | `60`                                         | Readiness timeout in seconds, 1..300.                                                                                         |
| `install-browsers`    | `false`                                      | Install the selected engine and Linux dependencies for a custom image.                                                        |
| `before-script`       | `[]`                                         | Trusted setup commands for the consuming application.                                                                         |
| `services`            | `[]`                                         | GitLab service container definitions.                                                                                         |
| `needs`               | `[]`                                         | Dependencies; default starts the job without waiting for other stages.                                                        |
| `rules`               | `[{when: on_success}]`                       | Control when the job runs.                                                                                                    |
| `runner-tags`         | `[]`                                         | Select runners if needed.                                                                                                     |
| `artifacts-expire-in` | `1 week`                                     | Retention for successful manuals and failed execution evidence.                                                               |

A Firefox profile can use a mobile-sized viewport and high DPI, but Playwright Firefox does not support `isMobile: true`. Use a viewport-only Firefox profile or Chromium/WebKit for mobile emulation.

## Profiles, filters and multiple includes

Give each include a distinct `job-name` and `output`. For example:

```yaml
include:
  - remote: https://raw.githubusercontent.com/openhoo/hooserguide/0.6.0/templates/generate/template.yml
    inputs:
      job-name: guide-desktop
      output: output/guide-desktop
      config: docs/user-guide/hooserguide.config.json
      browser: firefox
      profile: desktop
      tags: '@manual and not @destructive'
      scenario: Settings
      page-size: Letter
      orientation: landscape
      margin: 36
  - remote: https://raw.githubusercontent.com/openhoo/hooserguide/0.6.0/templates/generate/template.yml
    inputs:
      job-name: guide-mobile
      output: output/guide-mobile
      config: docs/user-guide/hooserguide.config.json
      browser: webkit
      profile: mobile
      tags: '@manual and not @destructive'
```

These workflows may change application data. Use the authorized test environment and accounts configured for documentation. Store credentials as masked/protected CI variables, not component inputs; environment-fill steps and ignored Playwright storage state work unchanged. The component does not upload config, plugins, auth state or app logs. Treat generated screenshots and authored prose as application content that needs privacy review.

## Artifacts and failure behavior

Artifacts are uploaded with `when: always` and `access: developer`. Only the current job-ID folder is uploaded; unrelated files and previous jobs under the artifact root are excluded. That folder contains:

```text
output/hooserguide/job-<CI_JOB_ID>/
├── summary.json
├── handbook.zip                       # successful run, when bundle=true
└── run-<timestamp>-<id>/
    ├── report.json
    ├── screenshots/                   # both masked image variants, overlays
    ├── index.html                     # successful runs only
    ├── handbook.md                     # successful runs only
    ├── handbook.pdf                    # successful runs with pdf=true
    └── pdf-layout.json                 # PDF layout audit, when available
```

`summary.json` uses paths relative to the checkout and records status, browser, profile, chapters and artifact locations. It points to the exact isolated run, not the newest directory from a previous job. A failed assertion or missing mask keeps the failed report and available images; no successful manual or ZIP is created. Invalid configuration/readiness/export/bundle operations fail the job. Installation and invalid-output failures may happen before an artifact directory exists.

The component never clears an existing job directory. Job IDs distinguish retries and pipelines even when a runner preserves the artifact root. A collision is an error; use the GitLab-provided job ID and reserve these directories for generated artifacts.

Open the extracted `index.html` with its `screenshots/` directory, or download the PDF/ZIP. Re-exporting does not revisit the application. Use the [Pages component](pages.md) to automatically publish successful evidence on the default branch.

## Qualification and self-tests

- `npm test` covers the job adapter, literal/typed inputs, selection, readiness, failures, output containment and template structure.
- `npm run test:package` installs the packed package in a clean consumer, then executes the actual component shell script against a real loopback app and checks PDF/ZIP/summary artifacts.
- `npm run test:browsers` qualifies Chromium, Firefox and WebKit with real saved-state workflows, masked screenshots, high-DPI scrolling/focus crops, HTML controls, PDF export, failures and cancellation.
- GitHub CI runs each browser qualification in a separate Linux job and retains evidence artifacts.
- `.gitlab-ci.yml` runs verification and includes the local component three times against the pipeline's own packed package.

GitLab's own CI Lint and runner execution remain the final check on the target GitLab instance. Local YAML/runner tests and GitHub qualification do not establish catalog publication or a successful native GitLab pipeline.

## Responsive features

Use `profiles: desktop,tablet,mobile` and `screen-layout: side-by-side` (or `stacked`) to override screen presentation. Define those profiles in config. `browser` overrides every selected profile engine; Firefox requires viewport-only mobile profiles. Use `profile` for a single screen or `profiles` for a comparison. See [responsive presentations](responsive.md) for complete examples, repeated app actions and evidence review.

## Automatic Pages deployment

Include `templates/pages/template.yml` after generation with `generate-job` and matching `source`. GitLab 17.10+ is required for the new component. It downloads the generating job artifacts, regenerates verified static output and publishes only on success. See [Pages workflows](pages.md) for complete GitLab and GitHub examples.
