import { describe, expect, it } from "vitest";

import { isProtectedScanAccount, isScanSignInEnabled } from "./scan-sign-in";

describe("isScanSignInEnabled", () => {
  it("is on only when SCAN_PASSWORD_SIGN_IN is exactly 1", () => {
    expect(isScanSignInEnabled({ SCAN_PASSWORD_SIGN_IN: "1" })).toBe(true);
    expect(isScanSignInEnabled({ SCAN_PASSWORD_SIGN_IN: "true" })).toBe(false);
    expect(isScanSignInEnabled({ SCAN_PASSWORD_SIGN_IN: "0" })).toBe(false);
    expect(isScanSignInEnabled({})).toBe(false);
  });
});

describe("isProtectedScanAccount", () => {
  const on = { SCAN_PASSWORD_SIGN_IN: "1" };
  it("protects only the scan account, only on the scan sandbox", () => {
    expect(isProtectedScanAccount("xyq-itso-scan@ust.hk", on)).toBe(true);
    expect(isProtectedScanAccount(" XYQ-ITSO-SCAN@ust.hk ", on)).toBe(true);
    expect(isProtectedScanAccount("someone@ust.hk", on)).toBe(false);
    expect(isProtectedScanAccount("xyq-itso-scan@ust.hk", {})).toBe(false);
    expect(isProtectedScanAccount(null, on)).toBe(false);
  });
});
