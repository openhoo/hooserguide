# Automatically publish user guides to Pages

Hooserguide provides a GitLab Pages component and GitHub composite actions. Generate the guide in CI, then publish its **exact successful execution**. Responsive mobile/tablet/desktop comparisons, annotation switching, search and PDF/ZIP downloads work on project subpaths and custom domains.

The static export is regenerated from verified evidence and copies only intended files: HTML, Markdown, optional PDF, both masked screenshot variants, sanitized execution report, optional PDF layout audit and a portable ZIP. It never copies config, plugins, credentials, storage state, overlays or unrelated files from the run folder. The prepared report uses source basenames and records re-export provenance. Exporting does not revisit the app.

## GitLab Pages

The `generate` component supports GitLab 17.0+. The new `pages` component requires **GitLab 17.10+**, with Pages enabled on the instance. It uses a named job and `pages.publish`; deployment artifacts are uploaded only on success. Native component references require a project mirrored/imported to the same GitLab instance. A pinned GitHub remote include works without a mirror:

```yaml
stages: [test, deploy]

include:
  - remote: https://raw.githubusercontent.com/openhoo/hooserguide/0.7.0/templates/generate/template.yml
    inputs:
      job-name: user-guide
      config: docs/user-guide/hooserguide.config.json
      output: output/user-guide
      profiles: desktop,tablet,mobile
      wait-url: http://127.0.0.1:3000/health
      before-script:
        - npm ci
        - npm run start > /tmp/app.log 2>&1 &
  - remote: https://raw.githubusercontent.com/openhoo/hooserguide/0.7.0/templates/pages/template.yml
    inputs:
      generate-job: user-guide
      source: output/user-guide
      output: public/user-guide
```

Adjust app startup, config and readiness to your application. Define the selected profiles in config. For a deployed application, omit `before-script` and supply its URL. Include both stages in your existing pipeline. The Pages job defaults to the project's default branch, depends on the successful generator job's artifacts and serializes deployments to the site.

`source` must match the generator's `output`. Each artifact root must contain **exactly one** `job-*/summary.json`; give guides distinct roots. The selected run must be successful and belong to that summary's job folder. The component publishes the _contents_ of `output` as the website root. `public/user-guide` is a local build folder, not a URL prefix.

### Pages component inputs

| Input                 | Default                            | Purpose                                                                        |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| `job-name`            | `hooserguide-pages`                | Unique deployment job name.                                                    |
| `stage`               | `deploy`                           | Existing pipeline stage.                                                       |
| `generate-job`        | `hooserguide`                      | Generating job to download artifacts from.                                     |
| `source`              | `output/hooserguide`               | Generator artifact root containing one job summary.                            |
| `output`              | `public`                           | Fresh relative folder; existing content is never removed.                      |
| `package`             | `github:openhoo/hooserguide#0.7.0` | Pinned isolated package installation.                                          |
| `image`               | `node:22-bookworm`                 | Node.js 22+; no browser is needed to publish existing evidence.                |
| `rules`               | Default branch                     | GitLab deployment rules. Keep them compatible with the generating job's rules. |
| `runner-tags`         | `[]`                               | Runner selection.                                                              |
| `artifacts-expire-in` | `1 week`                           | CI artifact retention; the Pages deployment uses `expire_in: never`.           |

When importing to GitLab, use `component: $CI_SERVER_FQDN/<namespace>/hooserguide/pages@0.7.0` with the same inputs. See [GitLab integration](gitlab.md). CI/CD Catalog registration remains separate from Pages deployment. The repository's native self-test pipeline includes all three engines and a Pages job using the packed package.

## GitHub Pages

In repository **Settings → Pages**, select **GitHub Actions** as the source. If your organization enforces environment or branch protection, allow the intended publishing branch in the `github-pages` environment. The example below publishes on pushes to `main` and manual dispatch; it does not grant deployment permissions to pull requests.

```yaml
name: Publish user guide
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: user-guide-pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run start > /tmp/app.log 2>&1 &
      - uses: openhoo/hooserguide/actions/generate@0.7.0
        id: guide
        with:
          config: docs/user-guide/hooserguide.config.json
          profiles: desktop,tablet,mobile
          wait-url: http://127.0.0.1:3000/health
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: guide-execution
          path: output/hooserguide-github/
      - uses: actions/configure-pages@v5
      - uses: openhoo/hooserguide/actions/pages@0.7.0
        with:
          run-directory: ${{ steps.guide.outputs.directory }}

  deploy:
    runs-on: ubuntu-latest
    needs: build
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

App setup runs in your workflow; the generation action installs hooserguide in a separate temporary runtime without editing your app's package files. It installs the matching Playwright browser by default. Use `install-browsers: 'false'` only when the selected browser/version and its system dependencies are already installed. Node.js 22 is configured by both composite actions. Use GitHub-hosted Linux runners or compatible self-hosted Linux runners; Pages actions require their supported runner runtime.

The deployment uses the official GitHub Pages artifact and OIDC flow. No personal access token is needed by consuming workflows. `needs: build` makes a failed generation, integrity check, PDF export or artifact upload prevent deployment. Existing published content remains until a successful replacement is deployed.

### Generate action inputs and outputs

`actions/generate` accepts `config`, `package`, `output`, `browser`, `profile`, `profiles`, `screen-layout`, `base-url`, `tags`, `scenario`, `pdf`, `bundle`, `fail-fast`, `page-size`, `orientation`, `margin`, `wait-url`, `wait-timeout` and `install-browsers`. Defaults match the GitLab generation component, except `output` defaults to `output/hooserguide-github` and browser installation defaults to `'true'`.

Boolean inputs are strings `'true'` or `'false'`; invalid values fail. `profile` and `profiles` are mutually exclusive. `directory` is the exact successful run directory. `summary` is the generation-summary JSON file containing artifact paths and execution coverage. A failed run sets no successful directory output. The generation root must be new; for self-hosted workspaces that retain files, supply a unique root such as `output/guide-${{ github.run_id }}-${{ github.run_attempt }}`.

### Pages action inputs and outputs

| Input           | Default                            | Purpose                                                              |
| --------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `run-directory` | Required                           | Exact successful run, preferably `steps.guide.outputs.directory`.    |
| `output`        | `_hooserguide-pages`               | Fresh relative static output folder.                                 |
| `package`       | `github:openhoo/hooserguide#0.7.0` | Pinned isolated package runtime.                                     |
| `artifact-name` | `github-pages`                     | Pages artifact name; use the same name in `deploy-pages` if changed. |

The Pages action prepares and uploads the site; the official `deploy-pages` step deploys it. Its `directory` output identifies the prepared local static directory. To publish an existing CI run, provide its extracted directory directly without running the generate action again. Preserve its screenshot/report evidence together; the action refuses incomplete or failed evidence.

The repository's own [Pages workflow](../.github/workflows/pages.yml) publishes a synthetic responsive HooTasks guide after successful main-branch CI and supports manual dispatch. It uses local actions and the checked-out package, so its own CI does not depend on an unpublished next-version tag.

## Prepare a site locally

```sh
hooserguide pages output/guides/run-... --output public/user-guide --json
```

The library exposes `preparePages(sourceDirectory, { output, root, bundle })`. The local command prepares static files only; uploading/deployment is handled by the Pages pipeline. Output must be a fresh folder inside the workspace, separate from source evidence. Escaping symlinks, existing targets, failed evidence and screenshot hash mismatches are rejected. Do not put the output inside an existing site folder with unrelated private files and upload the whole parent.

## Review publication

Pipeline authorization includes executing the configured workflows and publishing the selected handbook. A public Pages site exposes its authored prose, both masked screenshot variants, sanitized report and PDF/ZIP downloads. Use deliberate masks and authorized demo/test data; output verification does not discover unmasked private content. Site visibility and access control are platform settings, not inferred from repository visibility.

After deployment, verify the actual site URL, screenshot loading, raw/annotation switching and PDF/ZIP downloads under its project path. Inspect the exact deployment commit and environment URL. A successful local static export or upload is not proof of a live Pages deployment. GitLab runner execution and GitLab site verification require working authentication and a selected target project.

Platform references: [GitLab Pages job syntax](https://docs.gitlab.com/ci/yaml/#pages), [GitLab Pages setup](https://docs.gitlab.com/user/project/pages/), and [GitHub custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
