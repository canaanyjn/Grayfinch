---
name: deploy-grayfinch-cloudflare
description: Deploy and operate Grayfinch on Cloudflare Workers, D1, and Access using the repository's split public/admin architecture. Use for first-time Cloudflare setup, configuring Wrangler and Access, applying D1 migrations, deploying or redeploying Grayfinch, validating route isolation, or diagnosing production deployment failures.
---

# Deploy Grayfinch to Cloudflare

Deploy Grayfinch without weakening the separation between its public client API
and Access-protected administration console.

## Start here

Read [references/deployment-runbook.md](references/deployment-runbook.md) before
changing a production deployment. Then determine whether the request is:

- a first deployment;
- a routine redeployment;
- an Access or D1 reconfiguration; or
- a read-only diagnosis.

Do not mutate Cloudflare resources when the user only asks for an explanation,
review, or deployment plan.

## Inspect before acting

1. Inspect `package.json`, `wrangler.example.jsonc`,
   `wrangler.public.example.jsonc`, migrations, and the current Git status.
2. Confirm Node.js 22+, npm 10+, and successful `npm run ci`.
3. Check Wrangler authentication with `wrangler whoami`.
4. Detect existing local Wrangler files and Cloudflare resources before creating
   replacements.
5. Preserve unrelated local changes and never print account secrets or tokens.

## Preserve the security boundary

- Deploy the public and administration Workers separately.
- Bind both Workers to the same D1 database.
- Apply Cloudflare Access only to the administration Worker.
- Keep `/api/v1/config/*` on the public Worker and `/api/admin/*` on the
  administration Worker.
- Never enable `LOCAL_DEV_AUTH_BYPASS` in production.
- Keep `wrangler.jsonc`, `wrangler.public.jsonc`, and secret files untracked.
- Never run `seed.sql` against production.

Stop and explain the risk if the requested change violates an invariant.

## Execute the appropriate workflow

For a first deployment, create or reuse D1, apply migrations, deploy the public
and administration Workers, configure an Access self-hosted application for the
administration Worker, set the Team Domain and Audience in the ignored
administration config, redeploy, and verify both surfaces.

For a routine deployment, run CI, inspect new migrations, apply required remote
migrations, deploy both Workers, and perform the route checks below.

For a diagnosis, gather read-only evidence first: Wrangler identity, deployment
configuration, Worker logs where authorized, HTTP status and redirect behavior,
and D1 migration state. Identify the cause before proposing or applying a fix.

## Verify the result

Verify all four boundaries after deployment:

| Request | Expected result |
| --- | --- |
| Public Worker `/api/health` | `200` |
| Public Worker `/api/admin/summary` | `404` |
| Administration Worker without Access session | Access redirect or denial |
| Administration Worker `/api/v1/config/:appKey` | `404` |

Also verify an authenticated administrator can load the console and that a
known client token can fetch a published configuration. Redact tokens from
commands and reports.

## Report the handoff

State which resources were created or reused, which migrations and deployments
ran, the public and administration URLs, Access protection status, verification
results, and any values the user must still provide. Do not claim success from
a successful deploy command alone.
