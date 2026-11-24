# Troubleshoot a guide

## The browser does not launch

Run `npx playwright install chromium` from the project where hooserguide is installed. If a [named profile](../advanced.md#named-browser-profiles) selects Firefox or WebKit, install that browser instead. Check that the application is running at the configuration’s `baseURL`.

## No scenarios match, or a step is undefined

Run `npx hooserguide lint --config docs/user-guide/hooserguide.config.json` and read the reported feature file and line. Check the configured feature paths, tags, scenario filter and profile. Use `npx hooserguide steps --config docs/user-guide/hooserguide.config.json --search capture` to see exact step phrases and registered plugins. [Authoring feedback](../authoring.md#get-all-authoring-feedback-at-once) explains which checks require a browser.

## A selector, assertion or privacy mask fails

Read the first failed step in the run’s `report.json`. Confirm the page and accessible control name, then repair the [selector](../reference.md#selectors). For private content, keep the mask and check that it matches the intended element in each profile. Repeat the workflow only when its app actions are safe to perform again.

## The run has no PDF or HTML

A failed run keeps diagnostic evidence and cannot publish a successful handbook. Inspect the chapter and step statuses and the report’s `exportError`. For a passing run with HTML but no PDF, check the configuration’s `pdf` setting and the `--no-pdf` flag. See [reports and failures](../reference.md#reports-and-failures).

## Screenshots are missing after sharing a guide

Extract the whole ZIP before opening `index.html`. When transferring files manually, preserve the `screenshots/` directory and its filenames. If the original PNGs and report are intact, you can [rebuild from evidence](../advanced.md#rebuild-from-existing-evidence) without repeating app actions. A hash mismatch requires the original bytes or a new authorized run.
