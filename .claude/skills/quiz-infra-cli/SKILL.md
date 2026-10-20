---
name: quiz-infra-cli
description: Verified CLI syntax and pitfalls for this repo's infrastructure - Neon (project quiz-neon, per-environment branches and buckets, connection strings, env pull), Vercel (env records per environment, redeploy), applying DB migrations per environment, scrubbing branches, the media smoke test and test:mcp / test:e2e. Use before running neon, vercel, db migration or e2e commands here.
---

# Infrastructure CLI cheat sheet (verified 2026-10-20)

Rule of thumb: creating or changing external resources (branches, buckets, env vars, migrations, `git push`) needs the user to name the exact action first; read-only commands are free to run. Never print secret values - show only variable names. The harness blocks writing secrets through scripts unless the owner approved it explicitly, and `rm` with a shell variable target is blocked (use fixed paths or node `fs`).

## Identifiers

| What | Value |
| --- | --- |
| Neon org (the only one the CLI account belongs to) | `org-shy-paper-64501177` ("Vercel: prachwal's projects", Free) |
| Neon project | `quiz-neon` = `broad-leaf-41334668`, region `aws-us-east-1` |
| Branch `main` (PRODUCTION, default) | `br-broad-butterfly-b70003zq`, compute host `ep-old-rice-…` |
| Branch `preview` (all Vercel Preview deployments) | `br-muddy-mud-b78ol4b6`, host `ep-gentle-wind-…` |
| Branch `dev` (local development) | `br-noisy-thunder-b77gflw2`, host `ep-lingering-tooth-…` |
| Branch `e2e` (destructive tests) | `br-tiny-leaf-b7at7qm3`, host `ep-rough-forest-…` |
| Bucket | `media` (`public_read`) in EVERY branch; each branch has its own endpoint `br-<id>.storage.c-13.us-east-1.aws.neon.tech` and its own credentials |
| Vercel project | `quiz-vercel` (linked in `.vercel/project.json`) |

Hosts are shown by the scripts as a prefix only; the full URLs live in `.env.local` (`DATABASE_URL*`, `NEON_*_DATABASE_URL*`, `S3_*`) and are never printed.

## Neon CLI (v8.8)

- **Pitfall:** the tracked `.neon` file points at another org/project (`org-lively-boat-36489216` / `noisy-glade-31663888`) that this account cannot access. Never run `neon checkout` (it rewrites `.neon`), `neon deploy` or `neon config apply` without checking; always pass `--project-id broad-leaf-41334668` explicitly.
- Session: `neon me`, `neon orgs list`, `neon projects list --org-id org-shy-paper-64501177`.
- Branches: `neon branches list --project-id broad-leaf-41334668 --org-id org-shy-paper-64501177`.
- New branch (copy of production, without secrets): `neon branches create --name <name> --parent main --no-secrets --project-id broad-leaf-41334668 --org-id org-shy-paper-64501177`. The bucket is copied with the data; empty it before the branch serves a non-production environment (see `docs/vercel.md`, "Odświeżenie gałęzi").
- Connection strings: `neon connection-string <branch> --project-id broad-leaf-41334668 [--pooled] [--database-name neondb]` (without `--pooled` it is the direct/unpooled host; the scripts use `DATABASE_URL_UNPOOLED` for migrations). Print nothing; write the output straight into `.env.local` with a node script if needed.
- Buckets: `neon buckets list --project-id broad-leaf-41334668 --org-id org-shy-paper-64501177 --branch <main|dev|e2e|preview>` (each branch has `media`); create: `neon buckets create <name> ... --branch <name> --access-level public_read` (choices `private` | `public_read`; no CORS option); objects: `neon buckets object list|get|put|delete <target>`.
- Credentials: `neon credentials list --project-id ... --org-id ... --branch <name>`; `neon credentials reveal <tokenId>` shows secrets (do not paste the output).
- Env: `neon env pull --project-id broad-leaf-41334668 --branch <name> -s object-storage --file <path>` - `neon env pull` does NOT accept `--org-id`; without `--file` it writes into an existing `.env`, so always give a scratch file (matches `.env*` in `.gitignore`), read the keys with `sed -E 's/=.*/=<hidden>/'`, then delete the file with a fixed path. It writes `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `NEON_BRANCH`. Mapping to ours: `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_REGION`, plus `S3_BUCKET=media`, `S3_FORCE_PATH_STYLE=true`, `S3_KEY_PREFIX` (`dev/` locally, empty for production and preview), `MEDIA_PUBLIC_BASE_URL`.

## Vercel CLI (v64) and env records

- `vercel whoami`; `vercel env ls` (values are hidden; use `| grep NAME`).
- **Records created by the Vercel-Neon integration span all environments.** To split one, narrow the existing record to Production and create a new record per other environment. Read records with `vercel api GET /v10/projects/<id>/env` (ids of records, targets); change targets with `vercel api PATCH /v9/projects/<id>/env/<envId>` with body `{"target":["production"]}`; create with `vercel api POST /v10/projects/<id>/env` (body: key, value, type, target).
- Single-environment record from the CLI, value on stdin (the value is never echoed):
  `printf '%s' "$VALUE" | vercel env add NAME preview --force --yes` (and `development` / `production`). Secrets: add `--sensitive` after the environment (`sensitive` records cannot be pulled back and cannot be used for the `development` environment). Take values from `.env.local` with `grep -E "^NAME=" .env.local | cut -d= -f2-`, never print them.
- Env changes only apply to NEW deployments: redeploy afterwards. Cron jobs (`vercel.json` `crons`) run only on Production, and `CRON_SECRET` is needed there.
- Variables set for the media module: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_KEY_PREFIX`, `MEDIA_PUBLIC_BASE_URL`, `VITE_MEDIA_PUBLIC_BASE_URL`; `MEDIA_URL_FETCH` stays unset/false; `CRON_SECRET` (Production only); never set `MEDIA_CLEANUP_OWNER_FILTER` or `MEDIA_DRIVER=memory` anywhere on Vercel.
- Database variables: `DATABASE_URL` and `DATABASE_URL_UNPOOLED` per environment (Production = `main`, Preview = `preview`, Development = `dev`); `POSTGRES_*` and `PG*` exist for Production only.

## Database migrations (one database per environment)

Order: dev -> e2e -> preview -> prod. Every migration is applied by the owner, one approval per migration; check each with `--dry` first (read-only, nothing written):

- `npm run db:migrate:dev -- --dry`, `npm run db:migrate:e2e`, `npm run db:migrate:preview`
- `npm run db:migrate:prod -- --dry`, then `npm run db:migrate:prod -- --confirm-production` (production refuses to run without the flag)
- `npm run db:migrate` (no `--env`) migrates `DATABASE_URL` as before.
- Vercel does not apply migrations on deploy.
- Host check without printing the URL: `node --env-file-if-exists=.env --env-file-if-exists=.env.local -p "new URL(process.env.DATABASE_URL).hostname.split('.')[0]"`.

## Scrubbing a copy (non-production branches only)

- `node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/scrub-neon-branch.mjs <preview|dev|e2e>` is a dry run; `-- --apply` (one transaction) only after the owner says so. It needs `NEON_PROD_DATABASE_URL(_UNPOOLED)` set to check the host and refuses the production host.
- Dry run counts on the scrubbed branches are test leftovers only; a `preview` token named by `QZ_PREVIEW_BRANCH_TOKEN` is an `api_tokens` row that a scrub would remove.

## Tests that touch shared things

- Full MCP e2e (deletes every `mcp-e2e` row): `flock /tmp/claude-1000/mcp-e2e.lock env MCP_E2E_ALLOW_REMOTE_DB=1 npm run test:mcp`. It uses `NEON_E2E_DATABASE_URL` (branch e2e) when set, else `DATABASE_URL` with a warning; it prints `e2e database: <host prefix>`. First `ss -ltn | grep :8888` must be empty (the script reuses a running dev server).
- Browser e2e (5 Playwright tests, `[E2E]` rows, uploads under `dev/`): `E2E_ALLOW_REMOTE_DB=1 npm run test:e2e` with `LD_LIBRARY_PATH` and `PLAYWRIGHT_BROWSERS_PATH` pointing at the scratch Chromium libraries when the system lacks them.
- A production refusal is by design: `scripts/e2e-env.sh` and `scripts/scrub-neon-branch.mjs` exit before any connection when the host equals a `NEON_PROD_*` host.
- Media storage smoke (real bucket, writes and removes `dev/smoke/` objects): `npm run media:smoke -- --dry` (config only), `npm run media:smoke`; expect `RESULT: PASS`.
- Read-only leftover check after e2e: count rows whose text contains `mcp-e2e` or `[E2E]` in `media`, `media_refs`, `quizzes`, `admin_audit_log`, `classes`, `api_tokens`.
