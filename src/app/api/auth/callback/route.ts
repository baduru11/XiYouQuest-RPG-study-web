import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

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
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
