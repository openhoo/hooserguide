# Use the installed authoring skill

Skills installation supplies instructions and bundled references. The CLI and
browser runtime are installed separately in the application being documented.
Do not look for hooserguide's `src/` or root repository docs in that application.

## Runtime and discovery

With Node.js 22 or newer, install the runtime in the consuming project:

```sh
npm install -D github:openhoo/hooserguide
npm exec playwright -- install chromium
npm exec hooserguide -- --help
npm exec hooserguide -- steps --json
```

The project distributes through GitHub; pin a verified release ref when the user
needs reproducibility. Do not assume an npm registry release. Installing this
skill does not install the runtime, browsers, a running application or credentials.
Use the application's existing package manager and environment when appropriate.
Inspect `--help` and the actual step/tool catalogue before relying on options;
older runtime builds may lack authoring lint/editor/outline commands.

Create a guide where the consumer project stores documentation:

```sh
npm exec hooserguide -- init docs/user-guide --base-url http://localhost:3000 --skills --editor
```

Use the actual reachable application URL. `init --skills` copies only the author
and review skills to the guide project's `.agents/skills/`. If the consumer already
installed them with a skills manager, that flag is optional. Initialization
refuses to overwrite an existing project or skill destination; reuse its config.

## Existing projects and agent clients

Locate the project's config rather than assuming it is at the root. Paths in the
JSON config are relative to that file; CLI overrides such as run `--output` use
their documented CLI semantics. Keep private storage state and credentials ignored.

For MCP, configure a client to run the installed `hooserguide` binary with:

```text
mcp --config /absolute/path/to/project/hooserguide.config.json
```

Use an absolute binary/config path or a package-manager invocation that resolves
in the consuming project. The server is stdio and pinned to that one config.
Start with status and tool discovery; run IDs identify persisted evidence.
The server does not supply interactive app discovery, file editing or PDF-page
rendering, so use the session's existing tools for those operations.

Read the adjacent authoring-tools, authoring and MCP workflow references as the
task needs them. All consumer workflow guidance travels inside this skill.
