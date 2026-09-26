import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { oauth2: vi.fn() } } }));

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  // The notice must be reachable before sign-in (PDPO DPP1(3)): the point of
  // collection is this card, so the link lives in it rather than over the art.
  it("links the privacy notice from inside the sign-in card", () => {
    render(<LoginForm />);
    const link = screen.getByRole("link", { name: /privacy notice/i });
    expect(link.getAttribute("href")).toBe("/privacy");
  });
});
