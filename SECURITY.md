# Security

Report suspected vulnerabilities privately using this repository's GitHub private vulnerability reporting, when enabled, or contact the OpenHoo maintainers through GitHub. Do not post credentials, session files or sensitive screenshots in public issues.

Hooserguide runs locally with the permissions of its caller. Configurations, Gherkin features and plugins must be trusted. Plugins execute arbitrary JavaScript and workflows can change data in the target application. The stdio MCP server exposes the project selected at startup and does not provide a network listener.

Global and per-capture privacy masks are applied before either original or annotated screenshots are saved. Configured masks must match at least one element; absent masks fail the capture. The tool cannot infer every sensitive region, so review the exported images before sharing them. Execution reports include step text and may contain user-provided data. Use environment variable fill steps for credentials, ignore authentication state files, and keep private output outside published repositories.

Version 0.1.x is the initial supported line. Release security updates are not guaranteed on a fixed schedule.
