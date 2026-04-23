# Voice Orchestration Observability (No Real Voice Call)

This guide defines log-driven checkpoints to validate the orchestration flow only until provider API boundary.

## Scope

- In scope: request intake, rule evaluation, entity matching, provider redirection, Exotel API hit, Exotel API response.
- Out of scope: actual voice bot conversation quality, post-connect call behavior.

## Correlation Strategy

- Use `traceId` to stitch one execution across controller -> service -> provider.
- Each milestone emits `flow: "voice_orchestration"` and `step: "..."`.

## Step Dictionary

- `STEP_1_API_RECEIVED`: execute API request entered backend.
- `STEP_2_ACTION_RECEIVED`: payload validated and accepted for routing.
- `STEP_3_SERVICE_PROCESSING`: routing service started.
- `STEP_4_ROUTING_CONFIG_LOADED`: routing config fetched.
- `STEP_5_RULE_EVALUATED`: one rule evaluated (matched true/false).
- `STEP_6_RULE_MATCHED`: first matching rule selected.
- `STEP_6_NO_RULE_MATCH`: no matching rule.
- `STEP_7_ROUTING_REDIRECTION_DECIDED`: execution provider selected from routing action.
- `STEP_8_PROVIDER_INVOCATION_START`: provider invocation started.
- `STEP_8_EXOTEL_DISPATCH_START`: Exotel adapter started dispatch.
- `STEP_9_EXOTEL_API_HIT`: Exotel HTTP request sent.
- `STEP_10_EXOTEL_API_RESPONSE`: Exotel API response parsed.
- `STEP_9_PROVIDER_RESULT`: generic provider result returned.
- `STEP_10_API_RESPONSE_READY`: API response prepared for caller.

Entity query path:

- `STEP_3_ENTITY_QUERY_REQUESTED`
- `STEP_4_DB_QUERY`
- `STEP_5_ENTITY_MATCH_COMPLETED`
- `STEP_6_ENTITY_QUERY_RESULT`

Error steps start with `STEP_ERROR_...`.

## Suggested Leadership Metrics

- Routing requests received: count of `STEP_1_API_RECEIVED`
- Rule match rate: `STEP_6_RULE_MATCHED / STEP_1_API_RECEIVED`
- No-match rate: `STEP_6_NO_RULE_MATCH / STEP_1_API_RECEIVED`
- Redirection success: count of `STEP_7_ROUTING_REDIRECTION_DECIDED`
- Exotel API hit rate: count of `STEP_9_EXOTEL_API_HIT`
- Exotel accepted rate: `accepted=true` in `STEP_10_EXOTEL_API_RESPONSE`
- Failure distribution: grouped by `step` where step starts with `STEP_ERROR_`

## Example Log Filters

Filter all orchestration logs:

```text
flow="voice_orchestration"
```

Filter Exotel boundary only:

```text
flow="voice_orchestration" AND (step="STEP_9_EXOTEL_API_HIT" OR step="STEP_10_EXOTEL_API_RESPONSE")
```

Find one execution timeline:

```text
traceId="<trace-id>"
```

## Notes

- Phone values are masked in Exotel boundary logs (`toMasked`).
- Secrets are never logged.
- This instrumentation proves redirection and provider reachability without requiring a live voice-agent test.
