# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"quiz" is an early-stage React 19 + TypeScript + Vite app (still the Vite template scaffold: `src/App.tsx` is the default counter demo) deployed on Netlify, with a Netlify Functions backend backed by Netlify Database.

## Commands

- `npm run dev` — Vite dev server (frontend only; use `npx netlify dev` to run Vite plus functions on :8888)
- `npm run build` — `tsc -b && vite build` (output in `dist/`)
- `npm run lint` — Oxlint (config in `.oxlintrc.json`; not ESLint)
- `npm run preview` — serve the production build
- No test runner is configured.

## Architecture

- **Frontend**: `index.html` → `src/main.tsx` → `src/App.tsx`. Built by Vite with `@vitejs/plugin-react`.
- **Backend**: Netlify Functions in `netlify/functions/<name>.mts`, using the `export default async () => Response` form. A `[[redirects]]` rule in `netlify.toml` rewrites `/api/*` to `/.netlify/functions/:splat`, so the file name is the route: `planets.mts` is served at `GET /api/planets` (don't nest functions in subdirectories, as that changes the name; don't add `config.path` unless you want a custom route). It queries Netlify Database via `getDatabase()` from `@netlify/database` and tagged-template `db.sql`.
- **Netlify config**: `netlify.toml` builds with `npm run build` into `dist`. `[dev]` runs Vite (`npm run dev`, port 5173) behind `netlify dev` on http://localhost:8888, which also serves the functions, e.g. `curl localhost:8888/api/planets`.
- **Database**: schema lives in SQL migrations in `netlify/database/migrations/` (e.g. `create_planets`, which also seeds data). Apply them locally with `npx netlify database migrations apply`; Netlify applies them on deploy, so never change schema via direct connections.
- `.agents/skills/netlify-*/` contains Netlify-provided reference skills (functions, database, deploy, config, etc.); consult the relevant `SKILL.md` before changing Netlify-specific code.
- `.netlify/` is local Netlify state (gitignored).

## Gotchas

- `typescript` is pinned at `^4.9.5` while the template tsconfigs target newer tooling; if `tsc -b` complains about unsupported tsconfig options, check the TypeScript version first.
