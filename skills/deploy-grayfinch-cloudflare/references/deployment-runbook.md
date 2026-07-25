# Grayfinch Cloudflare Deployment Runbook

## Architecture

Grayfinch uses two Cloudflare Workers backed by one D1 database:

- `grayfinch` is public and serves `/api/health` and
  `/api/v1/config/:appKey`.
- `grayfinch-admin` serves the React console and `/api/admin/*`.
- Cloudflare Access protects only `grayfinch-admin`.

Selecting a Worker as a Cloudflare Access destination protects every route on
that Worker. Do not combine the public and administration routes into one
Access-protected deployment.

## Repository configuration

The tracked templates are:

- `wrangler.example.jsonc` for the administration Worker;
- `wrangler.public.example.jsonc` for the public Worker;
- `.dev.vars.example` for local development only.

Copy templates to `wrangler.jsonc` and `wrangler.public.jsonc`. Confirm those
files are ignored before adding account-specific values.

Both Wrangler files must use the same D1 `database_id`. The administration
configuration must contain:

```json
{
  "vars": {
    "DEPLOYMENT_ROLE": "admin",
    "ACCESS_TEAM_DOMAIN": "your-team.cloudflareaccess.com",
    "ACCESS_AUD": "your-access-application-audience"
  }
}
```

The public configuration must set `DEPLOYMENT_ROLE` to `public` and must not
need Access values.

## First deployment

Run commands from the repository root.

1. Validate the project:

   ```bash
   npm install
   npm run ci
   wrangler whoami
   ```

2. Create local configuration files if they do not exist:

   ```bash
   cp wrangler.example.jsonc wrangler.jsonc
   cp wrangler.public.example.jsonc wrangler.public.jsonc
   ```

3. List existing D1 databases before creating one. If no intended database
   exists, create it:

   ```bash
   wrangler d1 create grayfinch
   ```

4. Put the returned `database_id` in both ignored Wrangler files.

5. Apply migrations. Never apply `seed.sql` to production:

   ```bash
   npm run db:migrate:remote
   ```

6. Deploy both Workers:

   ```bash
   npm run deploy:public
   npm run deploy:admin
   ```

7. In Cloudflare Zero Trust, configure an identity provider, then create a
   self-hosted Access application whose destination type is **Workers** and
   whose scope is only the administration Worker. Add an **Allow** policy for
   explicit administrator identities; avoid an `Everyone` allow rule.

8. Copy the Zero Trust Team Domain and the Access application's Audience
   (`AUD`) into `wrangler.jsonc`, then redeploy the administration Worker:

   ```bash
   npm run deploy:admin
   ```

Wrangler can deploy Workers and D1 migrations. Access application support may
vary by Wrangler version; inspect `wrangler --help` before relying on it.
Cloudflare's dashboard or API is acceptable for Access configuration.

## Routine deployment

1. Review Git status and the diff to understand the release.
2. Run `npm run ci`.
3. If new D1 migrations exist, apply `npm run db:migrate:remote`.
4. Run `npm run deploy`.
5. Verify route isolation and one authenticated admin/client flow.

Do not recreate D1 or the Access application during a routine deployment.

## Verification

Use the actual URLs reported by Wrangler:

```bash
curl -i "https://PUBLIC_WORKER/api/health"
curl -i "https://PUBLIC_WORKER/api/admin/summary"
curl -i "https://ADMIN_WORKER/"
curl -i "https://ADMIN_WORKER/api/v1/config/example?client_id=probe"
```

Expected outcomes:

- public health returns `200`;
- public admin route returns `404`;
- unauthenticated admin requests redirect to or are denied by Access;
- the admin Worker does not expose the client config route.

For a client smoke test, obtain a real application key and token without
printing the token:

```bash
curl -i \
  "https://PUBLIC_WORKER/api/v1/config/APP_KEY?environment=production&client_id=smoke-test" \
  -H "Authorization: Bearer CLIENT_TOKEN"
```

## Failure triage

- **Admin redirects incorrectly:** verify the Access destination, policy,
  identity provider, Team Domain, and `AUD`.
- **Admin returns 401 behind Access:** the Worker-side JWT validation values
  likely do not match the Access application.
- **Public API redirects to Access:** Access was attached to the wrong Worker.
- **D1 errors:** confirm both bindings use the same database ID and migrations
  were applied to the intended account/database.
- **Unexpected 404:** confirm `DEPLOYMENT_ROLE` for each Worker and the deployed
  configuration file.
- **Build succeeds but assets fail:** inspect the administration Worker's asset
  binding and generated build output.

Before rollback, inspect the installed Wrangler version and its supported
deployment/version commands. Roll back code only after considering whether a
new migration remains compatible with the previous Worker.
