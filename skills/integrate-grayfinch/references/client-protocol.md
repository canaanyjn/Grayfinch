# Grayfinch Client Protocol

## Request

Fetch the selected configuration:

```http
GET /api/v1/config/:appKey?client_id=CLIENT_ID&environment=production&platform=macos&app_version=2.3.1
Authorization: Bearer CLIENT_TOKEN
If-None-Match: "OPTIONAL_PREVIOUS_ETAG"
```

Fields:

| Field | Requirement |
| --- | --- |
| `appKey` | Required application key |
| `client_id` | Required, non-empty, stable rollout identity |
| `environment` | Optional; defaults to `production`; one of `development`, `staging`, `production` |
| `platform` | Optional; `macos`, `windows`, `linux`, `ios`, or `android` |
| `app_version` | Optional semantic-version-like value |
| `Authorization` | Required bearer client token |
| `If-None-Match` | Optional ETag from the last valid response |

The endpoint belongs on the public Worker. Do not send Cloudflare Access
credentials to it.

## Successful response

A `200` response has this shape:

```json
{
  "app": "desktop-suite",
  "environment": "production",
  "version": 13,
  "label": "new-sidebar",
  "releaseId": "release-id",
  "variant": "canary",
  "matchedBy": "percentage",
  "config": {
    "featureFlags": {
      "newSidebar": true
    }
  }
}
```

`variant` is `stable` or `canary`. `matchedBy` is `stable`, `percentage`, or
`allowlist`.

Relevant response headers:

```http
ETag: "APP:ENVIRONMENT:vVERSION"
Cache-Control: private, max-age=0, must-revalidate
Vary: Authorization
```

When `If-None-Match` matches the currently selected version, Grayfinch returns
`304 Not Modified`. Keep the existing cache and do not expect a response body.

## Errors

- `400`: missing `client_id` or invalid environment/input;
- `401`: missing or invalid client token;
- `404`: unknown application or no published configuration for the environment;
- `5xx`: service failure; the response may include a request ID.

Do not erase a last-known-good configuration because of an error response.

## Assignment semantics

Grayfinch computes a deterministic bucket from the application key, stable
client ID, and the release salt.

1. With no canary version, return stable.
2. An explicit client allowlist match always returns canary and bypasses the
   platform, minimum-version, and percentage gates.
3. A non-empty platform target requires the client to send a matching platform.
4. A minimum version requires a valid matching `app_version`; missing or invalid
   values fail the gate.
5. Eligible clients receive canary when their bucket is below the configured
   percentage threshold.
6. The release salt remains stable as the percentage changes, keeping client
   assignment monotonic during expansion.

Because assignment depends on `client_id`, regenerating it can move a client
between stable and canary.

## Framework-neutral flow

```text
defaults = compiledDefaults
cached = storage.readLastKnownGood()
active = cached.config if cached is valid else defaults

response = fetchConfig(
  clientId = storage.getOrCreateStableClientId(),
  etag = cached.etag,
  timeout = shortBoundedTimeout
)

if response.status == 304:
  keep active
else if response.status == 200:
  candidate = validateSchema(response.body.config)
  storage.atomicWrite(candidate, response.etag)
  apply(candidate)
else:
  keep active
  scheduleRetryWithBackoffAndJitter()
```

Centralize request construction so the bearer token can be injected from the
product's existing secret/build configuration. Redact `Authorization` from
network logging.
