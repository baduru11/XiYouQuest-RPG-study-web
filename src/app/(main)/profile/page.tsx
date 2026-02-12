import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

const ProfileClient = dynamic(() => import("./profile-client"));

const COMPONENT_NAMES: Record<number, { name: string; chinese: string }> = {
  1: { name: "Monosyllabic Characters", chinese: "读单音节字词" },
  2: { name: "Multisyllabic Words", chinese: "读多音节词语" },
  3: { name: "Judgment", chinese: "选择判断" },
  4: { name: "Passage Reading", chinese: "朗读短文" },
  5: { name: "Prompted Speaking", chinese: "命题说话" },
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user!.id;

  const [
    { data: profile },
    { data: progress },
    { data: sessions },
    { data: userCharacters },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("user_progress").select("*").eq("user_id", userId),
    supabase
      .from("practice_sessions")
      .select("component, score")
      .eq("user_id", userId),
    supabase
      .from("user_characters")
      .select("*, characters(*)")
      .eq("user_id", userId),
  ]);

  return (
    <ProfileClient
      profile={profile}
      progress={progress || []}
      sessions={sessions || []}
      userCharacters={userCharacters || []}
      componentNames={COMPONENT_NAMES}
    />
  );
}
