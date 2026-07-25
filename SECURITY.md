# Security Policy

## Supported versions

Grayfinch is currently pre-1.0. Security fixes are applied to the latest
revision on the `main` branch.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting feature for this repository. If
that feature is unavailable, contact the maintainer through the private
contact information listed on their GitHub profile.

Please include:

- A description of the issue and its potential impact
- Reproduction steps or a minimal proof of concept
- The affected endpoint, component, or commit
- Any suggested mitigation

Avoid accessing data that does not belong to you, disrupting deployed
services, or publicly disclosing the issue before a fix is available.

## Credential handling

Client tokens, `.dev.vars`, Wrangler account configuration, Cloudflare
credentials, and Access session material must not be committed. If a
credential is exposed, rotate or revoke it immediately.
