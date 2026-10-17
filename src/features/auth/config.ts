export const auth0Config = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN as string | undefined,
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined,
  audience: import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined,
}

/** Auth is optional: without these env vars the app runs anonymously. */
export const authEnabled = Boolean(auth0Config.domain && auth0Config.clientId)
