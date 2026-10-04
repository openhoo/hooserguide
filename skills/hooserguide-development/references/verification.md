# Verification in the source checkout

Use commands from the repository root. The package scripts and CI are the source
of truth; avoid treating a historical version or successful earlier run as current.

## Focused work

```sh
npx tsx --test test/authoring.test.ts
npx tsx --test test/mcp.test.ts
npx tsx --test test/integrity.test.ts
npx tsx --test --test-name-pattern='capture defaults' test/features.test.ts
```

Choose the test that demonstrates the actual risk. Undefined/ambiguous bindings,
malformed arguments and invalid capture options should fail before app actions.
Test handlers against a loopback fixture rather than an unrelated live app.
Text-only unit tests cannot qualify screenshot geometry or export layout.

## Browser and rendered-output changes

`npm run test:browsers` qualifies Chromium, Firefox and WebKit. Set
`HOOSERGUIDE_TEST_BROWSER=chromium` for a focused engine run and
`HOOSERGUIDE_BROWSER_ARTIFACTS=output/browser-qualification` to retain artifacts.
Firefox uses viewport-only responsiveness; it does not support `isMobile: true`.

Inspect both masked PNG variants after scrolling and with device scale above 1.
For HTML/PDF changes, review desktop and narrow HTML plus rendered content pages.
Forme layout warnings and extracted PDF text supplement visual review; they do
not establish readable placement. Check overflow pages, figure slices and legends.

`npm run demo:responsive` produces a self-contained responsive example.
`npm run review:gallery` regenerates coordinate regression comparisons.
`npm run demo:docs` refreshes tracked demos/media and sanitizes source paths;
use it only when those published examples need regeneration.

## Skills and consumer installation

```sh
npm run test:skills
npm run test:skills:install
```

The first checks names/frontmatter, UI metadata, all bundled relative references
and the development discovery link. The second uses the actual Skills CLI in an
empty temporary Codex project and byte-compares all installed skill files. It
needs network access to obtain the installer, but installs from the local checkout
and does not publish or globally install skills.

`npm run test:package` packs and installs the runtime into a fresh consumer,
executes the binary/MCP and real component/action shells, and verifies every
copied consumer skill file. The tarball includes all three canonical skill
sources; `init --skills` installs only `hooserguide-author` and
`hooserguide-review`. Contributor auto-discovery stays in the source checkout.
Do not test consumers by relying on a globally installed skill or `dist` from an
earlier build. `prepare` builds the package; the clean-build sentinel catches
obsolete modules accidentally left in distribution.

## Distribution and live-state boundaries

For a release, inspect current workflows and package/version pins, including
hidden `.gitlab-ci.yml`, action defaults and template self-tests. Existing
distribution uses GitHub tags/release tarballs. Follow the user's publication
scope and verify the exact release commit rather than a previous green run.

A local template/action shell verifies packaged behavior. It does not prove
native GitLab CI Lint, pipeline/catalog registration, GitHub Pages deployment or
an actual live URL. After authorized publication, verify the deployment bound to
the intended commit and the real images and PDF/ZIP downloads. Fresh default-
branch Skills CLI installation verifies public skill distribution separately
from the runtime release.
