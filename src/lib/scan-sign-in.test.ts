import { describe, expect, it } from "vitest";

import { isScanSignInEnabled } from "./scan-sign-in";

describe("isScanSignInEnabled", () => {
  it("is on only when SCAN_PASSWORD_SIGN_IN is exactly 1", () => {
    expect(isScanSignInEnabled({ SCAN_PASSWORD_SIGN_IN: "1" })).toBe(true);
    expect(isScanSignInEnabled({ SCAN_PASSWORD_SIGN_IN: "true" })).toBe(false);
    expect(isScanSignInEnabled({ SCAN_PASSWORD_SIGN_IN: "0" })).toBe(false);
    expect(isScanSignInEnabled({})).toBe(false);
  });
});
