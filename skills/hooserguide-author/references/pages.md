# Automated Pages publication

Use when the user requests publishing a handbook to GitLab Pages or GitHub Pages. Creating pipeline files prepares automation; it does not prove the site is live.

- Generate authorized app workflows with deliberate masks and test data. Responsive selection applies normally. Pass the exact successful run to publication, never a guessed latest folder.
- GitLab: include `templates/pages/template.yml` alongside `generate`. Set `generate-job` to the generator job name and `source` to its artifact root. Include `deploy` in stages. GitLab 17.10+ and enabled Pages are required. Default rules publish only the default branch. Each guide needs a distinct source root with exactly one job summary. Same-instance native references require an imported/mirrored project.
- GitHub: call `actions/generate`, then `actions/pages` with `run-directory: ${{ steps.guide.outputs.directory }}`. Upload occurs only after static verification. Use a separate deployment job with `needs: build`, `pages: write`, `id-token: write`, `github-pages` environment and official `actions/deploy-pages@v4`. Set repository Pages source to GitHub Actions. No PAT is needed in consuming workflows.
- The package and action versions should be pinned together. The generation action installs the selected browser by default. App dependencies/startup belong to the caller. Isolated package installation preserves application package files. Persistent runners need fresh unique generation/publication output directories.
- `hooserguide pages <run> --output <fresh-relative-folder> --json` prepares static files locally. It regenerates HTML/PDF from verified screenshots, strips source paths to basenames and includes only intended masked evidence/downloads. It does not execute the app or deploy a site.
- Failed steps, incomplete responsive groups, hash mismatches or export failures block publication. Existing target folders are never deleted. Backend actions remain applied after failed/cancelled generation; do not automatically replay them.
- Review privacy for both masked variants and authored prose before authorized public delivery. Platform visibility is configured separately. After publishing, verify the exact deployment SHA, actual Pages URL, images, raw toggle and PDF/ZIP downloads. Report native platform/authentication blockers distinctly.

Full pipeline examples and inputs are in the packaged `docs/pages.md` or repository README. GitLab component publication to its CI/CD Catalog is separate from Pages deployment.
