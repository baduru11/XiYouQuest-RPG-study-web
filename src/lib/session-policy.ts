/**
 * Session and cookie policy for a High-risk application.
 *
 * HKUST ITSO "Guidelines on Web Application Security" v2.1 §4.4 asks for a
 * short session inactivity timeout. A session now expires after 8 hours
 * without use; any use after 30 minutes slides the expiry forward, so a full
 * study day is uninterrupted while an abandoned session dies the same day.
 * Better Auth's defaults (7 days, refreshed daily) are pinned away here so a
 * library upgrade cannot silently lengthen them.
 */
export const SESSION_POLICY = {
  expiresIn: 60 * 60 * 8,
  updateAge: 60 * 30,
} as const;

/**
 * Cookie attributes pinned explicitly rather than inherited from library
 * defaults. SameSite must stay Lax, not Strict: the OAuth callback from
 * login.microsoftonline.com is a cross-site top-level navigation that has to
 * carry the state cookie. `secure` is left to Better Auth, which sets it (and
 * the __Secure- prefix) whenever the base URL is https.
 */
export const COOKIE_ATTRIBUTES = {
  httpOnly: true,
  sameSite: "lax",
} as const;
