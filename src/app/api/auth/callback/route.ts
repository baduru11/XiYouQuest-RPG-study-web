import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAndUnlockAchievements } from "@/lib/achievements/check";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth provider errors
  if (error) {
    console.error("[Auth Callback] OAuth error:", error, errorDescription);
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", errorDescription || error);
    return NextResponse.redirect(loginUrl.toString());
  }

  if (!code) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "No authorization code received");
    return NextResponse.redirect(loginUrl.toString());
  }

  const supabase = await createClient();
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

  return NextResponse.redirect(`${origin}/dashboard`);
}
