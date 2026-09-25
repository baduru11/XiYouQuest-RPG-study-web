import { LoginForm } from "./login-form";
import Image from "next/image";
import Link from "next/link";

// Rendered per request so the proxy's CSP nonce reaches the page's inline
// scripts; a statically cached copy would carry stale, mismatched nonces and
// the strict production CSP would block hydration.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-x-clip p-4 pb-24">
      {/* w-full keeps the column sized by the viewport, not by the logo's
          intrinsic 450px width, so nothing overflows a 320px screen. */}
      <div className="flex w-full max-w-md flex-col items-center">
        <Image
          src="/img/background/Logo.webp"
          alt="XiYouQuest"
          width={450}
          height={150}
          priority
          fetchPriority="high"
          sizes="(max-width: 480px) calc(100vw - 2rem), 448px"
          className="w-full h-auto drop-shadow-lg"
        />
        <LoginForm />
        {/* Solid backing: the page background is a photograph, so text
            directly on it cannot guarantee WCAG AA contrast. */}
        <p className="mt-4 text-center text-sm">
          <Link
            href="/privacy"
            className="inline-block bg-card/95 px-2 py-1 text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Privacy notice
          </Link>
        </p>
      </div>
    </main>
  );
}
