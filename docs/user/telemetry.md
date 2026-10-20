# Product usage data

Product usage collection is disabled by default. To opt in, set
`T3CODE_TELEMETRY_ENABLED=true` in the server's environment before starting it.
When enabled, the server sends product usage events to `ingest.t3.codes` with hashed account
and installation identifiers. These identify your T3 Connect account, signed-in OpenAI and
Claude accounts, and each connected device. The endpoint keeps a copy of each
event and forwards events to PostHog. Events include the provider, model, reasoning effort,
permission mode, turn result, duration, release channel, and main-agent token totals when
available.

Events do not include prompts, responses, file contents, authentication tokens, conversation IDs,
raw provider events, or child-agent output. Child-agent token use is excluded from the totals.

Unset the variable or set it to `false` to stop product events from being recorded or sent.
Relay connection traces sent to Axiom also require this opt-in. Relay tracing stops when
`T3CODE_OTEL_SDK_DISABLED` or `OTEL_SDK_DISABLED` disables OpenTelemetry export.
The web app in a browser, including one the `t3` CLI opens, does not read these variables.

The desktop app reads `T3CODE_TELEMETRY_ENABLED` from your shell profile, such as `~/.zshrc`, on macOS and
Linux, so export it there and restart the app. On Windows, set it as a user environment variable.

## Export diagnostics to your own receiver

To send traces, metrics, or logs to an OpenTelemetry receiver, open
**Settings > General > Diagnostics**, select an environment, and enter each signal's OTLP HTTP
endpoint under **OpenTelemetry export** (for example `http://localhost:4318/v1/traces`). Save, then
restart that environment's server. The receiver must be reachable from the server's machine.
**Test** sends an empty export from the server to check an endpoint before or after you save it;
saved endpoints are checked when the section opens. Checks send authentication headers only to
the signal's currently running endpoint and do not follow redirects. To check a new endpoint
that requires authentication, save it and restart the server first.

`T3CODE_OTLP_*_URL` and standard `OTEL_EXPORTER_OTLP_*` environment variables override the saved
settings. For endpoints saved here or set with `T3CODE_OTLP_*_URL`, set `T3CODE_OTLP_HEADERS` for
receivers that need authentication and `T3CODE_OTLP_PROTOCOL=http/protobuf` for receivers that do
not accept JSON. An endpoint set with `OTEL_EXPORTER_OTLP_*` takes its headers and protocol from
`OTEL_EXPORTER_OTLP_HEADERS` and `OTEL_EXPORTER_OTLP_PROTOCOL` instead.
