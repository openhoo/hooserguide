# Publish a handbook to Pages

Start with a successful run. Pages verifies its report and both screenshot variants, then regenerates the website without opening the application. Choose [GitLab Pages](#gitlab-pages) or [GitHub Pages](#github-pages) to deploy, or prepare a folder for another static host.

## Prepare a site locally

```sh
hooserguide pages output/guides/run-... --output public/user-guide --json
```

Replace `run-...` with the exact directory from generation. Choose a fresh output directory inside your workspace, separate from the source run. Upload **only that directory's contents**. The local command prepares files; it does not deploy them. For TypeScript use `preparePages(sourceDirectory, { root, output, bundle })`.

The site includes HTML, Markdown, both masked PNG variants, a sanitized report and, when available, PDF and its layout audit. The default also includes a ZIP. The website and ZIP use the same generated report, Markdown, PDF and screenshots; only the website links to the ZIP. Source paths become basenames, and both outputs identify the original report hash. Config, storage state, plugins, overlays and unrelated files are excluded. Check the actual pictures and prose before making the site public: a hash cannot establish that a mask covered everything you intended.

## GitLab Pages

Use GitLab 17.10+ with Pages enabled. Add the deploy stage to your existing pipeline. This example runs a local application, generates a responsive handbook and publishes it on the default branch.

```yaml
stages: [test, deploy]

include:
  - remote: https://raw.githubusercontent.com/openhoo/hooserguide/0.8.4/templates/generate/template.yml
    inputs:
      job-name: user-guide
      config: docs/user-guide/hooserguide.config.json
      output: output/user-guide
      profiles: desktop,tablet,mobile
      wait-url: http://127.0.0.1:3000/health
      before-script:
        - npm ci
        - npm run start > /tmp/app.log 2>&1 &
  - remote: https://raw.githubusercontent.com/openhoo/hooserguide/0.8.4/templates/pages/template.yml
    inputs:
      generate-job: user-guide
      source: output/user-guide
      output: public/user-guide
```

The `generate-job` name must match the upstream job; `source` must match its artifact root. Pages requires exactly one `job-*/summary.json` under that root and a successful run inside that job folder. Give each guide its own root. The contents of `public/user-guide` become the site root; the folder name does not set its URL.

| Pages input              | Default                                                | Use                                                                        |
| ------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `generate-job`, `source` | `hooserguide`, `output/hooserguide`                    | Job whose artifacts to download and the root containing its summary.       |
| `output`                 | `public`                                               | Fresh relative directory to publish.                                       |
| `job-name`, `stage`      | `hooserguide-pages`, `deploy`                          | Unique job name and an existing stage.                                     |
| `package`, `image`       | `github:openhoo/hooserguide#0.8.4`, `node:22-bookworm` | Isolated Node.js runtime; publishing existing evidence needs no browser.   |
| `rules`, `runner-tags`   | default branch, `[]`                                   | Keep deploy rules compatible with generation and select runners if needed. |
| `artifacts-expire-in`    | `1 week`                                               | CI artifact retention. Pages deployment uses `expire_in: never`.           |

A mirror on the same GitLab instance can use `component: $CI_SERVER_FQDN/your-namespace/hooserguide/pages@0.8.4`. See the [generation inputs](gitlab.md#inputs) and [Pages template](../templates/pages/template.yml).

## GitHub Pages

Select **Settings → Pages → Source → GitHub Actions**. Allow your publishing branch in the `github-pages` environment if it is protected. This workflow builds on Linux and deploys only after generation and artifact upload succeed.

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
      - uses: openhoo/hooserguide/actions/generate@0.8.4
        id: guide
        with:
          config: docs/user-guide/hooserguide.config.json
          profiles: desktop,tablet,mobile
          wait-url: http://127.0.0.1:3000/health
      - uses: actions/configure-pages@v5
      - uses: openhoo/hooserguide/actions/pages@0.8.4
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

**Generation.** The [generate action](../actions/generate/action.yml) supports the workflow, selection, layout, readiness and package inputs in the [GitLab generation reference](gitlab.md#inputs). Its output root defaults to `output/hooserguide-github`, and `install-browsers` defaults to `'true'`. Pass booleans as strings. The action installs hooserguide separately from your app; use `install-browsers: 'false'` only if the matching engine and system dependencies are installed. Choose a unique `output` on persistent runners. On success, `directory` gives the exact run and `summary` gives the summary JSON path. To retain failure evidence, upload the dedicated generation root as an ordinary CI artifact.

**Publication.** The [Pages action](../actions/pages/action.yml) accepts `run-directory` (required), `output` (default `_hooserguide-pages`), `package` (default `github:openhoo/hooserguide#0.8.4`) and `artifact-name` (default `github-pages`). Its `directory` output identifies the prepared site. If you change the artifact name, give the same name to `deploy-pages`. To publish an existing CI run, extract it inside the workspace and pass its exact directory.

## Verify deployment

Open the environment URL from the deployment job for the intended commit. Follow a chapter link; switch a screenshot between raw and annotated; download the PDF (if enabled) and ZIP. These checks also verify relative paths when the site lives under a project prefix. Configure visibility on the hosting platform. A prepared folder or uploaded artifact alone does not confirm a live deployment.
