/**
 * ITSO scan sign-in: email + password sign-in for one dedicated scan account,
 * enabled only where SCAN_PASSWORD_SIGN_IN=1 is set (the xyq-sandbox project
 * that serves cle-xyq-dev). Production never sets it, so production stays
 * HKUST-SSO-only.
 *
 * Why: HKUST SSO cannot be replayed by an automated scanner. Every login
 * carries a one-time state value, so a recorded login fails on replay and the
 * scan stops once its session is lost. A password form can be replayed.
 * Sign-up stays disabled (Better Auth `disableSignUp`); the scan account is
 * created directly in the sandbox database and deleted after the scan.
 */
export function isScanSignInEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.SCAN_PASSWORD_SIGN_IN === "1";
}
