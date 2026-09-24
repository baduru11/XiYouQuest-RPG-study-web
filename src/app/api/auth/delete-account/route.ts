import { NextResponse } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { deleteAuthUser } from "@/lib/auth";

export async function DELETE() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  const supabase = await createClient();

  // Migration 003 dropped the profiles -> auth.users FK cascade, so there is no
  // DB-level backstop: if any app-data delete silently fails and we still delete
  // the Better Auth identity, the user's rows are orphaned forever. Every delete
  // therefore checks its `error` and aborts the whole request (before touching
  // the auth identity) if a critical step fails.
  const failIfError = (
    step: string,
    result: { error: { message: string } | null },
  ): void => {
    if (result.error) {
      throw new Error(`${step}: ${result.error.message}`);
    }
  };

  try {
    // Delete user data from all tables (order matters for FK constraints)

    // Delete learning data (FK order: nodes/checkpoints before plans)
    const { data: learningPlans, error: learningPlansError } = await supabase
      .from("learning_plans").select("id").eq("user_id", userId);
    failIfError("select learning_plans", { error: learningPlansError });
    const planIds = learningPlans?.map((p) => p.id) ?? [];
    if (planIds.length > 0) {
      failIfError(
        "delete learning_nodes",
        await supabase.from("learning_nodes").delete().in("plan_id", planIds),
      );
      failIfError(
        "delete learning_checkpoints",
        await supabase
          .from("learning_checkpoints")
          .delete()
          .in("plan_id", planIds),
      );
      failIfError(
        "delete learning_plans",
        await supabase.from("learning_plans").delete().eq("user_id", userId),
      );
    }

    // Delete chat data (FK order: messages before sessions)
    const { data: chatSessions, error: chatSessionsError } = await supabase
      .from("chat_sessions").select("id").eq("user_id", userId);
    failIfError("select chat_sessions", { error: chatSessionsError });
    const sessionIds = chatSessions?.map((s) => s.id) ?? [];
    if (sessionIds.length > 0) {
      failIfError(
        "delete chat_messages",
        await supabase
          .from("chat_messages")
          .delete()
          .in("session_id", sessionIds),
      );
    }
    failIfError(
      "delete chat_sessions",
      await supabase.from("chat_sessions").delete().eq("user_id", userId),
    );

    // Delete achievements
    failIfError(
      "delete user_achievements",
      await supabase.from("user_achievements").delete().eq("user_id", userId),
    );

    // Delete practice data (details before sessions)
    const { data: practiceSessions, error: practiceSessionsError } =
      await supabase.from("practice_sessions").select("id").eq("user_id", userId);
    failIfError("select practice_sessions", { error: practiceSessionsError });
    const practiceSessionIds = practiceSessions?.map((s) => s.id) ?? [];
    if (practiceSessionIds.length > 0) {
      failIfError(
        "delete practice_details",
        await supabase
          .from("practice_details")
          .delete()
          .in("session_id", practiceSessionIds),
      );
    }
    failIfError(
      "delete practice_sessions",
      await supabase.from("practice_sessions").delete().eq("user_id", userId),
    );
    failIfError(
      "delete user_progress",
      await supabase.from("user_progress").delete().eq("user_id", userId),
    );
    failIfError(
      "delete user_characters",
      await supabase.from("user_characters").delete().eq("user_id", userId),
    );
    failIfError(
      "delete quest_progress",
      await supabase.from("quest_progress").delete().eq("user_id", userId),
    );
    failIfError(
      "delete friendships",
      await supabase
        .from("friendships")
        .delete()
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    );
    failIfError(
      "delete mock_exam_results",
      await supabase.from("mock_exam_results").delete().eq("user_id", userId),
    );
    // Rate-limit counters record when and how often each feature was used and
    // have no foreign key, so nothing else would ever remove them.
    failIfError(
      "delete rate_limit_counters",
      await supabase.from("rate_limit_counters").delete().eq("user_id", userId),
    );
    failIfError(
      "delete profiles",
      await supabase.from("profiles").delete().eq("id", userId),
    );

    // Storage cleanup: log-but-continue. Orphaned avatar/chat files are a minor
    // storage leak, not a data-integrity problem, and must not block deleting
    // the identity once the relational rows are gone.
    try {
      const { data: avatarFiles } = await supabase.storage
        .from("avatars")
        .list(userId);
      if (avatarFiles && avatarFiles.length > 0) {
        await supabase.storage
          .from("avatars")
          .remove(avatarFiles.map((f) => `${userId}/${f.name}`));
      }

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
    } catch (storageError) {
      console.error(
        "[delete-account] storage cleanup failed (files orphaned, identity still removed):",
        storageError,
      );
    }

    // Only now, after every relational delete has succeeded, remove the
    // Better Auth identity (cascades sessions + OAuth accounts).
    await deleteAuthUser(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    // Abort with the auth identity intact so the user can retry a full delete.
    console.error("Delete account error:", error);
    return NextResponse.json(
      {
        error:
          "Account deletion did not complete; your account is still active. Please retry.",
      },
      { status: 500 }
    );
  }
}
