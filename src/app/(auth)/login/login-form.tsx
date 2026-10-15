"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, AlertCircle } from "lucide-react";

import { authClient } from "@/lib/auth-client";

// HKUST SSO is the only sign-in method. providerId "hkust" matches the
// redirect URI registered on the Entra app (see docs/oidc-redirect-uris.md).
const HKUST_PROVIDER_ID = "hkust";

interface LoginFormProps {
  /** ITSO scan sandbox only: show the password form for the scan account. */
  readonly scanSignIn?: boolean;
}

export function LoginForm({ scanSignIn = false }: LoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  async function handleHkustSignIn() {
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await authClient.signIn.oauth2({
        providerId: HKUST_PROVIDER_ID,
        callbackURL: "/dashboard",
      });
      if (signInError) {
        setError(signInError.message ?? "HKUST sign-in failed. Please try again.");
        setLoading(false);
      }
      // On success the browser is navigating to Microsoft — keep the spinner.
    } catch {
      setError("Couldn't reach the HKUST sign-in service. Please try again.");
      setLoading(false);
    }
  }

  async function handlePasswordSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
        callbackURL: "/dashboard",
      });
      if (signInError) {
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Couldn't reach the sign-in service. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md pixel-border chinese-corner bg-card p-6 space-y-6">
      <div className="text-center space-y-2">
        {/* No pixel-glow here: the red text-shadow behind red text drops the
            measured contrast below WCAG AA. */}
        <h1 className="font-pixel text-base text-primary">
          Continue
          <span className="sr-only">: sign in to XiYouQuest</span>
        </h1>
        <p className="text-muted-foreground">
          Sign in with your HKUST account to begin.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-2 border-destructive bg-destructive/10 p-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <noscript>
        {/* Without JavaScript the OAuth flow cannot start; hide the button so
            it does not look actionable and explain the requirement. */}
        <style>{`#hkust-signin-button { display: none; }`}</style>
        <div className="flex items-start gap-2 border-2 border-destructive bg-destructive/10 p-3">
          <p className="text-sm text-destructive">
            JavaScript is required to sign in. Please enable JavaScript in your
            browser and reload this page.
          </p>
        </div>
      </noscript>

      <Button
        id="hkust-signin-button"
        type="button"
        className="w-full"
        onClick={handleHkustSignIn}
        disabled={loading}
        aria-busy={loading || undefined}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Redirecting…
          </>
        ) : (
          "Sign in with HKUST"
        )}
      </Button>

      {scanSignIn ? (
        // ITSO scan sandbox only (see src/lib/scan-sign-in.ts).
        <form onSubmit={handlePasswordSignIn} className="space-y-3">
          <p className="text-center text-xs text-muted-foreground">
            Security scan account
          </p>
          <Input
            name="email"
            type="email"
            autoComplete="username"
            aria-label="Email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            aria-label="Password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="outline" className="w-full" disabled={loading}>
            Sign in with password
          </Button>
        </form>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        Use your @ust.hk or @connect.ust.hk account.
        <br />
        {/* Reachable before sign-in, at the point of collection (PDPO DPP1(3)). */}
        <Link
          href="/privacy"
          className="underline underline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Privacy notice
        </Link>
      </p>
    </div>
  );
}
