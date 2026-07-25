---
name: integrate-grayfinch
description: Integrate an existing desktop, mobile, web, or backend product with Grayfinch remote configuration and gradual rollouts. Use when adding the Grayfinch client request flow, choosing and persisting client_id, handling client tokens and ETags, validating and caching configuration, implementing safe defaults and retries, or testing stable/canary assignment behavior.
---

# Integrate Grayfinch

Add a small, resilient Grayfinch client to an existing product without making
startup or core behavior depend on the configuration service.

## Start here

Read [references/client-protocol.md](references/client-protocol.md) completely
before implementing the integration.

Inspect the product first: identify its language and framework, application
lifecycle, networking layer, persistence mechanism, configuration model,
platform/version sources, test conventions, and secret injection strategy.
Extend existing abstractions instead of introducing a parallel stack.

## Establish the contract

Obtain these values from the deployment or user:

- public Grayfinch base URL;
- application key;
- environment: `development`, `staging`, or `production`;
- client token;
- the product configuration schema and safe defaults.

Do not invent a token or commit it. A token shipped in a client binary can be
extracted, so treat it as an API access gate rather than high-trust
authentication. Never use remote configuration as an authorization boundary.

## Choose a stable client identity

Select a non-empty `client_id` whose lifetime matches the rollout:

- installation/device identity for device-level rollouts;
- an existing opaque account ID for account-level rollouts;
- a server-generated stable identifier for backend workloads.

Create and persist the identifier once. Never generate a new value per request.
Avoid raw personally identifiable information; use an opaque or appropriately
hashed identifier where needed.

## Implement the client

1. Define a typed/schema-validated configuration model with compiled defaults.
2. Load the last-known-good configuration and ETag atomically from durable
   storage.
3. Apply cached configuration early when safe, then refresh asynchronously.
4. Request `/api/v1/config/:appKey` with the stable `client_id`, environment,
   exact supported platform value, semantic application version, bearer token,
   and cached `If-None-Match`.
5. On `200`, validate the complete payload before atomically persisting and
   applying its `config` and new ETag.
6. On `304`, retain the cached configuration unchanged.
7. On timeout, network failure, invalid payload, or non-success status, retain
   the last-known-good configuration or compiled defaults.
8. Refresh on suitable lifecycle events or a conservative interval using a
   short timeout and exponential backoff with jitter. Never tight-poll.

Keep fetching, validation, persistence, and feature interpretation separated so
each can be tested.

## Operate safely

- Never log bearer tokens or sensitive client identifiers.
- Treat all remote values as untrusted input.
- Fail closed for safety-critical settings.
- Keep configuration application deterministic and thread-safe.
- Make incompatible schema changes additive or versioned.
- Include useful status/error telemetry without secret values.
- Do not block cold start indefinitely; use a bounded synchronous fetch only
  when the product explicitly requires it.

## Verify the integration

Test:

- `200` stable and canary payloads;
- `304 Not Modified`;
- `401`, `404`, malformed JSON, and schema mismatch;
- timeout, offline startup, retry/backoff, and cached fallback;
- persistence of `client_id` and ETag across restarts;
- atomic update behavior and safe defaults;
- rollout rollback or a return from canary to stable.

Run the project's normal formatter, static analysis, tests, and build. Report
where runtime values must be supplied and provide a redacted smoke-test
procedure.
