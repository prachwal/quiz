/** Bridge so the RTK Query base query (outside React) can read the current Auth0 access token. */
let getter: (() => Promise<string | undefined>) | null = null

export const setTokenGetter = (next: (() => Promise<string | undefined>) | null) => {
  getter = next
}

export async function getAccessToken(): Promise<string | null> {
  if (!getter) return null
  try {
    return (await getter()) ?? null
  } catch {
    return null
  }
}
