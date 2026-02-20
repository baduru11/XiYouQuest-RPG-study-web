import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  try {
    // Delete user data from all tables (order matters for FK constraints)
    await supabase.from("practice_details").delete().in(
      "session_id",
      (
        await supabase
          .from("practice_sessions")
          .select("id")
          .eq("user_id", userId)
      ).data?.map((s) => s.id) ?? []
    );
    await supabase.from("practice_sessions").delete().eq("user_id", userId);
    await supabase.from("user_progress").delete().eq("user_id", userId);
    await supabase.from("user_characters").delete().eq("user_id", userId);
    await supabase.from("quest_progress").delete().eq("user_id", userId);
    await supabase
      .from("friendships")
      .delete()
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    await supabase.from("profiles").delete().eq("id", userId);

    // Delete avatar from storage
    const { data: avatarFiles } = await supabase.storage
      .from("avatars")
      .list(userId);
    if (avatarFiles && avatarFiles.length > 0) {
      await supabase.storage
        .from("avatars")
        .remove(avatarFiles.map((f) => `${userId}/${f.name}`));
    }

    // Delete auth user via admin client (requires service role key)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey && serviceRoleKey !== "your_service_role_key") {
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey
      );
      await admin.auth.admin.deleteUser(userId);
    } else {
      // Sign out if we can't delete the auth user
      await supabase.auth.signOut();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
