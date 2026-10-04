# Automated Pages publication

Use when the user requests publishing a handbook to GitLab Pages or GitHub Pages. Creating pipeline files prepares automation; it does not prove the site is live.

- Generate authorized app workflows with deliberate masks and test data. Responsive selection applies normally. Pass the exact successful run to publication, never a guessed latest folder.
- GitLab: include `templates/pages/template.yml` alongside `generate`. Set `generate-job` to the generator job name and `source` to its artifact root. Include `deploy` in stages. GitLab 17.10+ and enabled Pages are required. Default rules publish only the default branch. Each guide needs a distinct source root with exactly one job summary. Same-instance native references require an imported/mirrored project.
- GitHub: call `actions/generate`, then `actions/pages` with `run-directory: ${{ steps.guide.outputs.directory }}`. Upload occurs only after static verification. Use a separate deployment job with `needs: build`, `pages: write`, `id-token: write`, `github-pages` environment and official `actions/deploy-pages@v4`. Set repository Pages source to GitHub Actions. No PAT is needed in consuming workflows.
- The package and action versions should be pinned together. The generation action installs the selected browser by default. App dependencies/startup belong to the caller. Isolated package installation preserves application package files. Persistent runners need fresh unique generation/publication output directories.
- `hooserguide pages <run> --output <fresh-relative-folder> --json` prepares static files locally. It regenerates HTML/PDF from verified screenshots, strips source paths to basenames and includes only intended masked evidence/downloads. It does not execute the app or deploy a site.
- Failed steps, incomplete responsive groups, hash mismatches or export failures block publication. Existing target folders are never deleted. Backend actions remain applied after failed/cancelled generation; do not automatically replay them.
- Review privacy for both masked variants and authored prose before authorized public delivery. Platform visibility is configured separately. After publishing, verify the exact deployment SHA, actual Pages URL, images, raw toggle and PDF/ZIP downloads. Report native platform/authentication blockers distinctly.

## Consumer pipeline shapes

GitLab includes both pinned templates in the existing pipeline. Adapt startup,
profiles and readiness to the consuming app; keep the source/output roots paired:

```yaml
stages: [test, deploy]
include:
  - remote: https://raw.githubusercontent.com/openhoo/hooserguide/0.8.1/templates/generate/template.yml
    inputs:
      job-name: user-guide
      config: docs/user-guide/hooserguide.config.json
      output: output/user-guide
      wait-url: http://127.0.0.1:3000/health
      before-script:
        - npm ci
        - npm run start > /tmp/guide-app.log 2>&1 &
  - remote: https://raw.githubusercontent.com/openhoo/hooserguide/0.8.1/templates/pages/template.yml
    inputs:
      generate-job: user-guide
      source: output/user-guide
      output: public/user-guide
```

For GitHub, in the build job after app setup/readiness, use
`openhoo/hooserguide/actions/generate@0.8.1` with `id: guide`, your `config` and
`wait-url`. Run `actions/configure-pages@v5`, then
`openhoo/hooserguide/actions/pages@0.8.1` with
`run-directory: ${{ steps.guide.outputs.directory }}`. A separate `deploy` job
needs the build, `pages: write` and `id-token: write` permissions, the
`github-pages` environment, and `actions/deploy-pages@v4` with `id: deployment`.
The environment URL is `${{ steps.deployment.outputs.page_url }}`. Configure the
repository's Pages source as GitHub Actions and choose the intended default-branch
or manual-dispatch triggers. Application dependency installation and startup stay
in the caller's build job.

These examples use a published release pin; choose the user's verified release or
commit and keep package/action/template versions together. CI/CD Catalog
publication is separate from a Pages deployment. The consumer workflow and its
checks are contained in this reference; it does not require hooserguide source.
