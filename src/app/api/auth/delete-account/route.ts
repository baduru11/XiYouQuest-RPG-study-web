import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";

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

    // Delete learning data (FK order: nodes/checkpoints before plans)
    const { data: learningPlans } = await supabase
      .from("learning_plans").select("id").eq("user_id", userId);
    const planIds = learningPlans?.map((p) => p.id) ?? [];
    if (planIds.length > 0) {
      await supabase.from("learning_nodes").delete().in("plan_id", planIds);
      await supabase.from("learning_checkpoints").delete().in("plan_id", planIds);
      await supabase.from("learning_plans").delete().eq("user_id", userId);
    }

    // Delete chat data (FK order: messages before sessions)
    const { data: chatSessions } = await supabase
      .from("chat_sessions").select("id").eq("user_id", userId);
    const sessionIds = chatSessions?.map((s) => s.id) ?? [];
    if (sessionIds.length > 0) {
      await supabase.from("chat_messages").delete().in("session_id", sessionIds);
    }
    await supabase.from("chat_sessions").delete().eq("user_id", userId);

    // Delete achievements
    await supabase.from("user_achievements").delete().eq("user_id", userId);

    // Delete practice data
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

    // Delete chat images from storage
    const { data: chatImageFolders } = await supabase.storage
      .from("chat-images")
      .list(userId);
    if (chatImageFolders && chatImageFolders.length > 0) {
      for (const folder of chatImageFolders) {
        const { data: files } = await supabase.storage
          .from("chat-images")
          .list(`${userId}/${folder.name}`);
        if (files && files.length > 0) {
          await supabase.storage
            .from("chat-images")
            .remove(files.map((f) => `${userId}/${folder.name}/${f.name}`));
        }
      }
    }

    // Delete auth user via admin client (requires service role key)
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY,
    );
    await admin.auth.admin.deleteUser(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
