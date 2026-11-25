# Generate a guide in GitLab CI

Use the `generate` component to run your scenarios against a test application and save the handbook as a job artifact. If you also want a website, add the separate [Pages job](pages.md#gitlab-pages) after generation.

## Add the generation job

For GitLab 17.0+, include the pinned template in your pipeline. Change the config path, app startup command and readiness URL for your project:

```yaml
stages: [test]

include:
  - remote: https://raw.githubusercontent.com/openhoo/hooserguide/0.11.0/templates/generate/template.yml
    inputs:
      config: docs/user-guide/hooserguide.config.json
      base-url: http://127.0.0.1:3000
      wait-url: http://127.0.0.1:3000/health
      before-script:
        - npm ci
        - npm run start > /tmp/hooserguide-app.log 2>&1 &
```

For a running test deployment, omit `before-script`. With a GitLab service container, use its service alias in both URLs. Keep credentials in protected CI variables or ignored storage state; workflows execute real application actions. The default image contains the matching browsers, and the job installs hooserguide in a temporary directory separate from your application's dependencies.

**Other include forms:** If the tagged project lives on the same GitLab instance, use `component: $CI_SERVER_FQDN/your-namespace/hooserguide/generate@0.11.0`. If the template lives in your checkout, use `local: /templates/generate/template.yml`. The inputs are the same. Publishing a component in the CI/CD Catalog is a separate GitLab release step.

## Select an engine and workflows

Use `profile: mobile` for one screen, or `profiles: desktop,tablet,mobile` for a [responsive guide](responsive.md). Define these profiles in the config. The component's `browser` input sets the engine for every selected profile. Firefox supports narrow viewports but rejects `isMobile: true`.

To narrow the job, add `tags: '@manual and not @destructive'` and/or `scenario: Settings`. For multiple jobs, give each include a distinct `job-name` and `output`; keep the job you publish paired with its own artifact root.

## Find the result

Open `summary.json` inside the job artifact. Its paths are relative to the checkout. Use the recorded run directory, especially when retries or different profiles produce several similar runs.

```text
output/hooserguide/job-<CI_JOB_ID>/
  summary.json
  handbook.zip                 # if requested and generation succeeded
  run-<timestamp>-<id>/
    report.json
    screenshots/               # original and annotated PNGs; annotation overlays
    index.html
    handbook.md
    handbook.pdf               # if PDF export was enabled
    pdf-layout.json            # when a PDF layout audit is available
```

Only the current job-ID folder is uploaded (`when: always`, `access: developer`). A failed assertion, missing privacy mask or export failure prevents a successful handbook; the report and available evidence help identify the failing step. Readiness, packaging and installation failures also fail the job. Installation or invalid-output errors may occur before a summary exists. Existing job directories are never cleared. Download the whole run to open its HTML with its images.

## Inputs

Defaults below match the [generation template](../templates/generate/template.yml). Config-relative feature, plugin and storage-state paths stay relative to the config file.

| Input                                | Default                                               | Use                                                                                                            |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `job-name`, `stage`                  | `hooserguide`, `test`                                 | Job identifier and an existing pipeline stage.                                                                 |
| `config`, `output`                   | `hooserguide.config.json`, `output/hooserguide`       | Config inside the checkout and relative parent for the job-ID folder.                                          |
| `browser`                            | `chromium`                                            | `chromium`, `firefox` or `webkit`.                                                                             |
| `profile`, `profiles`                | empty                                                 | Keep configured selection or override it. Use only one of the two.                                             |
| `screen-layout`                      | `config`                                              | Keep the configured layout, or choose `side-by-side` or `stacked`.                                             |
| `base-url`, `tags`, `scenario`       | empty                                                 | Override the HTTP(S) app URL, Cucumber tag expression or scenario name substring.                              |
| `pdf`, `bundle`, `fail-fast`         | `true`, `true`, `false`                               | Export PDF, create a portable ZIP, or stop after the first failing scenario.                                   |
| `page-size`, `orientation`, `margin` | `config`, `config`, `0`                               | Override with `A4` or `Letter`, `portrait` or `landscape`, and 24–72 points. Zero keeps the configured margin. |
| `wait-url`, `wait-timeout`           | empty, `60`                                           | Optional HTTP readiness check; 2xx/3xx is ready. Timeout: 1–300 seconds.                                       |
| `package`                            | `github:openhoo/hooserguide#0.11.0`                   | Isolated package source; relative `file:` paths resolve from the checkout.                                     |
| `image`, `install-browsers`          | `mcr.microsoft.com/playwright:v1.63.0-noble`, `false` | With a custom Node.js 22+ Linux image, install the matching selected browser and its system dependencies.      |
| `before-script`, `services`          | `[]`, `[]`                                            | Trusted app setup commands and service containers.                                                             |
| `needs`, `rules`, `runner-tags`      | `[]`, `[{when: on_success}]`, `[]`                    | Job dependencies, execution rules and runner selection. Empty `needs` permits an immediate start.              |
| `artifacts-expire-in`                | `1 week`                                              | Retain successful manuals and available failed-run evidence.                                                   |

The source checkout's package smoke runs the actual component shell against a loopback application. For verification on your GitLab instance, validate the pipeline with CI Lint, run it on your runner, and inspect the resulting job artifact.
