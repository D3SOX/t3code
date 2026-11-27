# Product usage data and diagnostics

Product usage events and relay connection traces are disabled by default. To opt in, set `T3CODE_TELEMETRY_ENABLED=true` in the server's environment before starting it. When enabled, T3 Code sends lightweight product usage events and relay connection traces to keep the app reliable and fast. Prompts, responses, file contents, and credentials are never included (unless you explicitly approve an [agent feedback](#agent-feedback) card with conversation text attached).

## Product usage events

When enabled, the server sends usage events to `ingest.t3.codes` under a hashed random install ID (plus a hashed T3 Connect account ID when signed in, and random client device IDs). Events contain provider, catalog model name (non-catalog models report as custom), reasoning effort, permission mode, turn/request outcome, duration, release channel, and token counts.

## Enable or disable telemetry

- **Server / CLI**: Set `T3CODE_TELEMETRY_ENABLED=true` before starting to opt in; unset it or set it to `false` to stop. `DO_NOT_TRACK=1` stops telemetry even when `T3CODE_TELEMETRY_ENABLED=true`.
- **Desktop app**: Export `T3CODE_TELEMETRY_ENABLED=true` in your shell profile (macOS/Linux) or user environment variables (Windows) and restart to opt in. `DO_NOT_TRACK=1` keeps it off.
- **Managed policy**: Administrators can set `"telemetry": false` in [managed policy](./managed-policy.md#other-capabilities) for servers and desktop apps.
- **Mobile app**: Toggle **Send crash reports** and **Send connection traces** separately in **Settings → About T3 Code → Diagnostics**.

## Relay connection diagnostics

When server telemetry is enabled, T3 Connect sends connection timings, request paths, environment/thread IDs, and error types (no addresses, logs, or stack frames) to Axiom. `DO_NOT_TRACK=1`, `T3CODE_OTEL_SDK_DISABLED`, or `OTEL_SDK_DISABLED` also turn it off.

## Agent feedback

Optional tool for agents to report T3 Code bugs or missing capabilities. Configure in **Settings → Labs → Agent feedback**:

- **Off** (default): Feedback tools and `t3 feedback` are disabled.
- **When I ask**: Agents submit a report only when you ask, shown as an interactive approval card before anything leaves your machine.
- **Automatic**: Also sends minimal automated reports (problem kind + tool/command name only—no text or conversation) when an agent hits a T3 tool failure; enables `t3 feedback` CLI reporting (up to 10/hour).

Approval cards show exact payloads (expected/actual/workaround, turn outline with no text, and optional **Include the conversation** up to 16 KB). File paths, usernames, hostnames, git remotes, and secret-like strings are scrubbed before saving, and reports use one-off random IDs. Inspect local reports with `t3 feedback list [--json]`.

## Agent activity for mobile notifications

**Settings → Sharing & access → Publish agent activity** sends project/thread titles, model names, and turn status to the T3 Connect relay for [mobile notifications and live activities](./mobile-notifications.md). This is independent of telemetry—turn it off directly on the host if you don't want it.

## Export diagnostics to your own OpenTelemetry receiver

Open **Settings → Maintenance → Diagnostics** (per environment) and enter OTLP HTTP endpoints (e.g. `http://localhost:4318/v1/traces`), save, and restart the server. Use **Test** to verify connectivity.

`T3CODE_OTLP_*_URL` and standard `OTEL_EXPORTER_OTLP_*` env vars override saved settings (use `T3CODE_OTLP_HEADERS` / `T3CODE_OTLP_PROTOCOL=http/protobuf` or the standard `OTEL_EXPORTER_OTLP_*` equivalents for auth and protobuf).
