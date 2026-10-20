---
name: quiz-infra-cli
description: Verified CLI syntax and pitfalls for this repo's infrastructure - Neon (project quiz-neon, bucket, credentials, env pull), Vercel (env add, redeploy), applying DB migrations, the media smoke test and test:mcp. Use before running neon, vercel, db migration or e2e commands here.
---

# Infrastructure CLI cheat sheet (verified 2026-10-20)

Rule of thumb: creating or changing external resources (buckets, env vars, migrations, `git push`) needs the user to name the exact action first; read-only commands are free to run. Never print secret values - show only variable names.

## Identifiers

| What | Value |
| --- | --- |
| Neon org (the only one the CLI account belongs to) | `org-shy-paper-64501177` ("Vercel: prachwal's projects", Free) |
| Neon project | `quiz-neon` = `broad-leaf-41334668`, region `aws-us-east-1` |
| Neon default branch | `main` = `br-broad-butterfly-b70003zq` |
| Bucket | `media` (`public_read`) on branch `main` |
| S3 endpoint | `https://br-broad-butterfly-b70003zq.storage.c-13.us-east-1.aws.neon.tech` (path-style) |
| Public object URL | `<endpoint>/media/<key>`; `MEDIA_PUBLIC_BASE_URL=<endpoint>/media`, key already contains `S3_KEY_PREFIX` |
| Vercel project | `quiz-vercel` (linked in `.vercel/project.json`) |

## Neon CLI (v8.8)

- **Pitfall:** the tracked `.neon` file points at another org/project (`org-lively-boat-36489216` / `noisy-glade-31663888`) that this account cannot access. Never run `neon checkout` (it rewrites `.neon`), `neon deploy` or `neon config apply` without checking; always pass `--project-id broad-leaf-41334668` explicitly.
- Session: `neon me`, `neon orgs list`, `neon projects list --org-id org-shy-paper-64501177`.
- Branches: `neon branches list --project-id broad-leaf-41334668 --org-id org-shy-paper-64501177`.
- Buckets: `neon buckets list --project-id broad-leaf-41334668 --org-id org-shy-paper-64501177 --branch main`; create: `neon buckets create <name> --project-id broad-leaf-41334668 --org-id org-shy-paper-64501177 --branch main --access-level public_read` (choices `private` | `public_read`; there is no CORS option - the default answers `access-control-allow-origin: *`); objects: `neon buckets object list|get|put|delete <target>`.
- Credentials: `neon credentials list --project-id ... --org-id ... --branch main` (the "Default object storage credential" has `storage:read, storage:write`); `neon credentials reveal <tokenId>` shows secrets (do not paste output).
- Env: `neon env pull --project-id broad-leaf-41334668 --branch main -s object-storage --file <path>` - `neon env pull` does NOT accept `--org-id`; without `--file` it writes into an existing `.env`, so always give a scratch file (matches `.env*` in `.gitignore`), read the keys with `sed -E 's/=.*/=<hidden>/'`, then delete the file. It writes `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `NEON_BRANCH`. Mapping to ours: `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_REGION`, plus `S3_BUCKET=media`, `S3_FORCE_PATH_STYLE=true`, `S3_KEY_PREFIX` (`dev/` local, `preview/` Preview, empty Production), `MEDIA_PUBLIC_BASE_URL`.

## Vercel CLI (v64)

- `vercel whoami`, `vercel env ls` (values are hidden; use `| grep NAME`).
- Add a variable to ALL Preview branches without prompts, value from stdin (no echo of the value):
  `printf '%s' "$VALUE" | vercel env add NAME preview --yes`
  Secrets: add `--sensitive` after the environment: `printf '%s' "$VALUE" | vercel env add S3_SECRET_ACCESS_KEY preview --sensitive --yes`. Production: `... vercel env add NAME production --yes`. Take values from `.env.local` with `grep -E "^NAME=" .env.local | cut -d= -f2-`.
- Env changes only apply to NEW deployments: redeploy afterwards. Cron jobs (`vercel.json` `crons`) run only on Production, and `CRON_SECRET` is needed there.
- Variables set for the media module: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_KEY_PREFIX`, `MEDIA_PUBLIC_BASE_URL`, `VITE_MEDIA_PUBLIC_BASE_URL`; `MEDIA_URL_FETCH` stays unset/false; `CRON_SECRET` (Production only); never set `MEDIA_CLEANUP_OWNER_FILTER` or `MEDIA_DRIVER=memory` anywhere on Vercel.

## Database migrations (shared Neon DB, owner approval per migration)

- `npm run db:migrate` has no `DATABASE_URL` in a plain shell; run
  `node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/migrate.mjs`
  and check the host first with `node --env-file-if-exists=.env --env-file-if-exists=.env.local -p "new URL(process.env.DATABASE_URL).hostname"`.
- Vercel does not apply migrations on deploy.

## Tests that touch shared things

- Media storage smoke (real bucket, writes and removes `dev/smoke/` objects): `npm run media:smoke -- --dry` (config only), `npm run media:smoke`; expect `RESULT: PASS`.
- Full MCP e2e (shared DB, deletes every `mcp-e2e` row): `flock /tmp/claude-1000/mcp-e2e.lock env MCP_E2E_ALLOW_REMOTE_DB=1 npm run test:mcp`; first `ss -ltn | grep :8888` must be empty (the script reuses a running dev server and would use the wrong environment).
- Read-only leftover check after e2e: count rows whose owner/title contains `mcp-e2e` in `media`, `media_refs`, `quizzes`, `admin_audit_log`.
