"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error, data: signUpData } = await supabase.auth.signUp(data);

  if (error) {
    return { error: error.message };
  }

  // Fire-and-forget account_created achievement
  if (signUpData.user) {
    const { checkAndUnlockAchievements } = await import("@/lib/achievements/check");
    checkAndUnlockAchievements(supabase, signUpData.user.id, { type: "account_created" }).catch(() => {});
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  // Pin redirectTo to a trusted constant — never trust the Origin header
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/api/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.url) {
    redirect(data.url);
  }
}

export async function signInWithDiscord() {
  const supabase = await createClient();
  // Pin redirectTo to a trusted constant — never trust the Origin header
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: `${siteUrl}/api/auth/callback`,
      scopes: "identify email relationships.read",
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.url) {
    redirect(data.url);
  }
}
