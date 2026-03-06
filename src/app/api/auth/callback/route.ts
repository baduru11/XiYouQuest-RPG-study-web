import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth provider errors — sanitize before reflecting
  if (error) {
    console.error("[Auth Callback] OAuth error:", error, errorDescription);
    const safeError = (errorDescription || error || "Authentication failed")
      .replace(/[<>"'`]/g, "")
      .substring(0, 200);
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", safeError);
    return NextResponse.redirect(loginUrl.toString());
  }

  if (!code) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "No authorization code received");
    return NextResponse.redirect(loginUrl.toString());
  }

  // Build a Supabase client that writes cookies directly onto the redirect response
  const redirectUrl = new URL("/dashboard", origin);
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("[Auth Callback] Code exchange failed:", exchangeError.message);
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "Authentication failed. Please try again.");
    return NextResponse.redirect(loginUrl.toString());
  }

  // Check for Discord identity and upsert discord_id to profiles
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const discordIdentity = user.identities?.find(
      (identity) => identity.provider === "discord"
    );

    if (discordIdentity) {
      await supabase
        .from("profiles")
        .update({ discord_id: discordIdentity.id })
        .eq("id", user.id);
    }

    // Fire-and-forget achievement check for account creation
    try {
      await checkAndUnlockAchievements(supabase, user.id, { type: 'account_created' });
    } catch (err) {
      console.error("Auth callback achievement check error:", err);
    }
  }

  return response;
}
