#!/usr/bin/env bash
# Sourced (not run) by scripts/mcp-local-e2e.sh and scripts/e2e-browser.sh: picks the database that the destructive
# suites write to. Environments are split (docs/vercel.md, "Środowiska i bazy danych"):
#   NEON_E2E_DATABASE_URL set    -> DATABASE_URL (and DATABASE_URL_UNPOOLED) become the e2e branch, for this run only
#   NEON_E2E_DATABASE_URL unset  -> DATABASE_URL stays as it is (the dev branch) and a warning is printed
#   host equal to a NEON_PROD_* host -> refused before anything connects
# Values are read by node from .env and .env.local (never sourced, never printed; only host prefixes are shown).
E2E_ENV_FLAGS=(--env-file-if-exists=.env --env-file-if-exists=.env.local)

# e2e_env_value NAME: the value of NAME from the shell or the env files ('' when unset)
e2e_env_value() {
  node "${E2E_ENV_FLAGS[@]}" -p "process.env.$1 ?? ''"
}

# e2e_host_of NAME: hostname of the URL in NAME, without the -pooler suffix ('' when unset, 'invalid' when not a URL)
e2e_host_of() {
  node "${E2E_ENV_FLAGS[@]}" -p "(u => { try { return u ? new URL(u).hostname.replace('-pooler', '') : '' } catch { return 'invalid' } })(process.env.$1)"
}

# e2e_select_database : exits 2 when the run would use the production compute
e2e_select_database() {
  if [ -n "$(e2e_env_value NEON_E2E_DATABASE_URL)" ]; then
    export DATABASE_URL
    DATABASE_URL="$(e2e_env_value NEON_E2E_DATABASE_URL)"
    if [ -n "$(e2e_env_value NEON_E2E_DATABASE_URL_UNPOOLED)" ]; then
      export DATABASE_URL_UNPOOLED
      DATABASE_URL_UNPOOLED="$(e2e_env_value NEON_E2E_DATABASE_URL_UNPOOLED)"
    fi
  else
    echo "WARNING: NEON_E2E_DATABASE_URL is not set, so this run writes to DATABASE_URL (the dev branch)." >&2
  fi

  # the guard runs before anything connects to the database
  local db_host name prod_host
  db_host="$(e2e_host_of DATABASE_URL)"
  for name in NEON_PROD_DATABASE_URL NEON_PROD_DATABASE_URL_UNPOOLED; do
    prod_host="$(e2e_host_of "$name")"
    if [ -n "$prod_host" ] && [ "$db_host" = "$prod_host" ]; then
      echo "refusing: the e2e database is the production compute (host ${db_host%%.*}); nothing was started." >&2
      exit 2
    fi
  done
  echo "e2e database: ${db_host%%.*}"
}
