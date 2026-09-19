# Product usage data

Product usage collection is disabled by default. You can opt in by setting
`T3CODE_TELEMETRY_ENABLED=true` in the server's environment before starting it. When enabled, the
T3 Code server sends product usage events to PostHog, associated with a hashed account or
installation identifier. Events include the provider, model, reasoning effort, permission mode,
turn result, duration, and main-agent token totals when available.

Events do not include prompts, responses, file contents, authentication tokens, conversation IDs,
raw provider events, or child-agent output. Child-agent token use is excluded from the totals.

Unset the variable or set it to `false` to stop product events from being recorded or sent.
