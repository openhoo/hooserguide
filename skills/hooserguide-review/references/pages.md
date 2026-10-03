# Review Pages output

Use for GitLab/GitHub Pages pipelines or a published hooserguide website.

- Identify the exact source run, deployment commit, target project/repository and Pages environment URL. Generation, preparation/upload and live deployment are separate outcomes.
- Require successful execution/report/export status and complete responsive coverage. Review both masked image variants and public authored prose. Static Pages output includes sanitized report, screenshots and optional PDF/ZIP; credentials/config/storage state/plugins/overlays/unrelated files must be absent.
- Check the prepared report records original `generatedAt`, re-export timestamp and source-report hash with basename-only source paths. Preparation regenerates exports from old evidence; it is not a fresh application check.
- GitLab job must depend on successful generator artifacts, use its distinct artifact root, require one job summary and upload only on success. Default-branch rules need to agree with generation rules. GitLab 17.10+ uses the named Pages job and `pages.publish`.
- GitHub publication must use official Pages upload/deploy actions, a deployment job dependent on the build, Pages/OIDC permissions and the intended `github-pages` environment. Do not deploy pull-request content using privileged workflows without explicit scope and appropriate controls. Custom artifact names must agree in upload and deploy.
- Verify the actual site at its project prefix: every screenshot loads, annotation switching updates image links/legends, search works and PDF/ZIP/report links resolve. Inspect rendered PDF pages as usual. Check that no unrelated parent directory was uploaded.
- A local package test or successful upload does not establish a live site. State auth/runner/catalog limitations separately; repairing a pipeline alone does not authorize unrelated public data or replaying workflows.
