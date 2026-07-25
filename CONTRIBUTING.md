# Contributing to Grayfinch

Thank you for helping improve Grayfinch.

## Before you start

- Search existing issues and pull requests to avoid duplicate work.
- Open an issue before beginning a large feature or behavior change.
- Keep changes focused and avoid unrelated refactors.
- Never include production credentials, client tokens, or account-specific
  Wrangler configuration in a contribution.

## Development setup

```bash
npm install
cp .dev.vars.example .dev.vars
cp wrangler.example.jsonc wrangler.jsonc
cp wrangler.public.example.jsonc wrangler.public.jsonc
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Node.js 22 or newer is required.

## Quality checks

Run the following before submitting a pull request:

```bash
npm run typecheck
npm test
npm run build
```

Add or update tests whenever behavior changes.

## Pull requests

- Use a clear title and explain the motivation for the change.
- Describe user-facing and operational impact.
- Include verification steps and screenshots for interface changes.
- Keep commits readable; maintainers may squash them when merging.
- Confirm that no generated output or local Cloudflare state is included.

By contributing, you agree that your contribution is licensed under the
project's MIT License.
