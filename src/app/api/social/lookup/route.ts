import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.trim().length === 0) {
    return NextResponse.json(
      { error: "Friend code is required" },
      { status: 400 }
    );
  }

  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, current_level, friend_code")
      .eq("friend_code", code.trim())
      .neq("id", user.id)
      .single();

    if (error || !profile) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
