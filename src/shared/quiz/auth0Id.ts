/**
 * Auth0 user ids: `<provider>|<id>`, where social connections through a generic OAuth2 provider add one more
 * segment, e.g. `google-oauth2|1234`, `auth0|6a11f0`, `oauth2|discord|6065`, `oauth2|twitch|2778`.
 */
export const AUTH0_ID_PATTERN = /^[\w-]+(\|[\w.-]+)+$/

export const isAuth0Id = (value: string) => value.length >= 3 && value.length <= 200 && AUTH0_ID_PATTERN.test(value)
