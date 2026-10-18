/**
 * Local-only login bypass for `npm run dev` / `netlify dev`: set `VITE_DEV_AUTH_TOKEN` (the same value as the
 * server's `DEV_AUTH_TOKEN`, min. 16 characters) and the app skips Auth0, acting as `VITE_DEV_AUTH_USER_ID`
 * (default `dev|local`) with `VITE_DEV_AUTH_ROLES` (default `admin,teacher`).
 *
 * Gated on `import.meta.env.DEV`, so production builds drop it (and the token value) entirely, and the API
 * ignores the token outside `netlify dev` anyway (see server/devAuth.ts).
 */
const token = import.meta.env.DEV ? (import.meta.env.VITE_DEV_AUTH_TOKEN as string | undefined) : undefined

export const devAuth =
  token && token.length >= 16
    ? {
        token,
        userId: (import.meta.env.VITE_DEV_AUTH_USER_ID as string | undefined)?.trim() || 'dev|local',
        roles: ((import.meta.env.VITE_DEV_AUTH_ROLES as string | undefined) ?? 'admin,teacher')
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean),
      }
    : null
