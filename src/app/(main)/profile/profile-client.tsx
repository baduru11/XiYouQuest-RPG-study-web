"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUserLevel, getAffectionLevel } from "@/lib/gamification/xp";
import { STREAK_MULTIPLIERS, USER_LEVELS } from "@/types/gamification";
import {
  Pencil,
  Check,
  X,
  Camera,
  Flame,
  Trophy,
  Swords,
  Star,
  Target,
  Zap,
  Heart,
  Trash2,
  Loader2,
  Download,
} from "lucide-react";

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_xp: number;
  current_level: number;
  last_login_date: string | null;
  login_streak: number;
  created_at: string;
}

interface UserProgress {
  component: number;
  questions_attempted: number;
  questions_correct: number;
  best_streak: number;
}

interface PracticeSession {
  component: number;
  score: number;
}

interface UserCharacterWithDetails {
  character_id: string;
  affection_xp: number;
  affection_level: number;
  is_selected: boolean;
  characters: {
    name: string;
    image_url: string;
    personality_description: string;
  };
}

interface ProfileClientProps {
  profile: Profile | null;
  progress: UserProgress[];
  sessions: PracticeSession[];
  userCharacters: UserCharacterWithDetails[];
  componentNames: Record<number, { name: string; chinese: string }>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProfileClient({
  profile,
  progress,
  sessions,
  userCharacters,
  componentNames,
}: ProfileClientProps) {
  const router = useRouter();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(profile?.display_name || "");
  const [displayName, setDisplayName] = useState(profile?.display_name || "Adventurer");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { level, name: levelName, xpToNext } = getUserLevel(profile?.total_xp ?? 0);
  const totalXP = profile?.total_xp ?? 0;
  const nextLevelXP = xpToNext ? totalXP + xpToNext : totalXP;
  const xpProgress = xpToNext ? (totalXP / nextLevelXP) * 100 : 100;

  // Streak multiplier
  let streakMultiplier = 1;
  for (const [threshold, mult] of Object.entries(STREAK_MULTIPLIERS)) {
    if ((profile?.login_streak ?? 0) >= Number(threshold)) {
      streakMultiplier = mult;
    }
  }

  // Academic stats
  const totalAttempted = progress.reduce((sum, p) => sum + p.questions_attempted, 0);
  const totalCorrect = progress.reduce((sum, p) => sum + p.questions_correct, 0);
  const overallAccuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
  const totalSessions = sessions.length;

  async function handleSaveName() {
    if (!profile || nameValue.trim() === "") return;
    const trimmed = nameValue.trim().slice(0, 15);
    setSaving(true);
    try {
      const res = await fetch("/api/profile/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: trimmed }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setDisplayName(trimmed);
      setEditingName(false);
      router.refresh();
    } catch {
      toast.error("Couldn't save your display name. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? `Upload failed (${res.status})`);
      }
      setAvatarUrl(data.avatarUrl);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Couldn't upload your avatar. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Profile Header */}
      <Card>
        <CardContent className="px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative group">
              <div className="h-20 w-20 pixel-border bg-muted overflow-hidden flex items-center justify-center">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    width={80}
                    height={80}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <span className="font-pixel text-2xl text-primary">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                aria-label="Change avatar"
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
              >
                <Camera className="h-6 w-6 text-white" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>

            {/* Name & Meta */}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      className="h-8 w-full sm:w-48 font-retro text-xl"
                      maxLength={15}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveName();
                        if (e.key === "Escape") setEditingName(false);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleSaveName}
                      disabled={saving}
                      aria-label="Save display name"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingName(false)}
                      aria-label="Cancel editing name"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <h1 className="font-pixel text-lg text-primary pixel-glow leading-relaxed">
                      {displayName}
                    </h1>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNameValue(displayName);
                        setEditingName(true);
                      }}
                      aria-label="Edit display name"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
              {profile?.username && (
                <p className="text-base text-muted-foreground">@{profile.username}</p>
              )}
              <div className="flex items-center gap-3 mt-0.5">
                <span className="font-pixel text-sm text-pixel-gold">
                  Lv.{level} {levelName}
                </span>
                <span className="text-sm sm:text-xl text-muted-foreground">
                  {profile?.created_at
                    ? `Member since ${formatDate(profile.created_at)}`
                    : "New member"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Gamification Stats */}
      <div>
        <h2 className="font-pixel text-sm text-foreground mb-3">Adventure Stats</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {/* Total XP */}
          <Card>
            <CardContent className="px-3 py-2 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <Zap className="h-4 w-4 text-pixel-gold" />
                <p className="font-pixel text-lg text-primary pixel-glow">
                  {totalXP.toLocaleString()}
                </p>
              </div>
              <p className="text-lg text-muted-foreground">Total XP</p>
              <div className="mt-1 h-1.5 w-full bg-muted border border-border overflow-hidden">
                <div
                  className="h-full bg-pixel-green transition-all"
                  style={{ width: `${xpProgress}%` }}
                />
              </div>
              <p className="text-base text-muted-foreground mt-0.5">
                {xpToNext ? `${xpToNext} to Lv.${level + 1}` : "Max level!"}
              </p>
            </CardContent>
          </Card>

          {/* Level & Rank */}
          <Card>
            <CardContent className="px-3 py-2 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <Trophy className="h-4 w-4 text-pixel-gold" />
                <p className="font-pixel text-lg text-primary pixel-glow">
                  Lv.{level}
                </p>
              </div>
              <p className="text-lg text-muted-foreground">{levelName}</p>
              <p className="text-base text-muted-foreground mt-1">
                Next: {USER_LEVELS[level + 1]?.name ?? "—"}
              </p>
            </CardContent>
          </Card>

          {/* Login Streak */}
          <Card>
            <CardContent className="px-3 py-2 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <Flame className="h-4 w-4 text-pixel-red" />
                <p className="font-pixel text-lg text-primary pixel-glow">
                  {profile?.login_streak ?? 0}
                </p>
              </div>
              <p className="text-lg text-muted-foreground">Day Streak</p>
              {streakMultiplier > 1 && (
                <p className="text-base text-pixel-green mt-1 font-semibold">
                  {streakMultiplier}x XP Bonus
                </p>
              )}
            </CardContent>
          </Card>

          {/* Total Sessions */}
          <Card>
            <CardContent className="px-3 py-2 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <Swords className="h-4 w-4 text-pixel-blue" />
                <p className="font-pixel text-lg text-primary pixel-glow">
                  {totalSessions}
                </p>
              </div>
              <p className="text-lg text-muted-foreground">Sessions</p>
              <p className="text-base text-muted-foreground mt-1">
                {overallAccuracy}% accuracy
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 3: Academic Performance */}
      <div>
        <h2 className="font-pixel text-sm text-foreground mb-3">Academic Performance</h2>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6, 7].map((comp) => {
            const p = progress.find((pr) => pr.component === comp);
            const compSessions = sessions.filter((s) => s.component === comp);
            const avgScore =
              compSessions.length > 0
                ? Math.round(
                    compSessions.reduce((sum, s) => sum + s.score, 0) /
                      compSessions.length
                  )
                : 0;
            const accuracy =
              p && p.questions_attempted > 0
                ? Math.round((p.questions_correct / p.questions_attempted) * 100)
                : 0;

            return (
              <Card key={comp}>
                <CardContent className="px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-pixel text-sm text-primary">
                      {comp <= 5 ? `Quest ${comp}` : `Drill ${comp - 5}`}
                    </p>
                    {avgScore > 0 && (
                      <span
                        className={`font-pixel text-sm ${
                          avgScore >= 80
                            ? "text-pixel-green"
                            : avgScore >= 50
                            ? "text-pixel-gold"
                            : "text-pixel-red"
                        }`}
                      >
                        {avgScore}%
                      </span>
                    )}
                  </div>
                  <p className="text-xl text-muted-foreground mb-2">
                    {componentNames[comp]?.name}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 text-lg">
                    <div className="flex items-center gap-1.5">
                      <Target className="h-5 w-5 text-muted-foreground" />
                      <span>{p?.questions_attempted ?? 0} attempted</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check className="h-5 w-5 text-pixel-green" />
                      <span>{p?.questions_correct ?? 0} correct</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Star className="h-5 w-5 text-pixel-gold" />
                      <span>{p?.best_streak ?? 0} best streak</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg text-muted-foreground">
                        {accuracy}% accuracy
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Section 4: Characters */}
      <div>
        <h2 className="font-pixel text-sm text-foreground mb-3">Characters</h2>
        {userCharacters.length === 0 ? (
          <Card>
            <CardContent className="px-3 py-4 text-center text-lg text-muted-foreground">
              No characters unlocked yet. Visit the Character page to unlock your first companion!
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {userCharacters.map((uc) => {
              const { level: affLevel, name: affName, xpToNext: affNext } =
                getAffectionLevel(uc.affection_xp);
              const affProgress = affNext
                ? (uc.affection_xp / (uc.affection_xp + affNext)) * 100
                : 100;

              return (
                <Card
                  key={uc.character_id}
                  className={uc.is_selected ? "pixel-border-primary" : ""}
                >
                  <CardContent className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 pixel-border bg-muted overflow-hidden flex items-center justify-center">
                        {uc.characters.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={uc.characters.image_url}
                            alt={uc.characters.name}
                            width={48}
                            height={48}
                            className="object-contain"
                          />
                        ) : (
                          <span className="font-pixel text-sm">
                            {uc.characters.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-pixel text-sm text-primary">
                            {uc.characters.name}
                          </p>
                          {uc.is_selected && (
                            <span className="text-base text-pixel-green font-semibold">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Heart className="h-4 w-4 text-pixel-red" />
                          <span className="text-lg text-muted-foreground">
                            {affName} (Lv.{affLevel})
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full bg-muted border border-border overflow-hidden">
                          <div
                            className="h-full bg-pixel-red transition-all"
                            style={{ width: `${affProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 5: Your Data (PDPO data access; see /privacy) */}
      <div>
        <h2 className="font-pixel text-sm text-foreground mb-3">Your Data</h2>
        <Card>
          <CardContent className="px-4 py-3 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-retro text-lg text-foreground">Download My Data</p>
                <p className="text-sm text-muted-foreground">
                  A copy of everything XiYouQuest holds about you, as a JSON file.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="font-pixel text-sm self-start sm:self-auto">
                <a href="/api/profile/export" download>
                  <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Download
                </a>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              What we collect, who can see it, and where it is processed:{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                privacy notice
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Section 6: Danger Zone */}
      <div>
        <h2 className="font-pixel text-sm text-destructive mb-3">Danger Zone</h2>
        <Card className="border-destructive/30">
          <CardContent className="px-4 py-3">
            {!showDeleteConfirm ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-retro text-lg text-foreground">Delete Account</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete your account and all data
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="font-pixel text-sm"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="font-retro text-lg text-destructive font-bold">
                  This action is permanent and cannot be undone.
                </p>
                <p className="text-sm text-muted-foreground">
                  All your progress, characters, practice history, and friendships will be permanently deleted.
                  Type <span className="font-bold text-foreground">DELETE</span> to confirm.
                </p>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  className="h-8 w-full sm:w-48 font-retro text-base"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteConfirmText !== "DELETE" || deleting}
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        const res = await fetch("/api/auth/delete-account", {
                          method: "DELETE",
                        });
                        if (res.ok) {
                          window.location.href = "/login";
                        } else {
                          setDeleting(false);
                        }
                      } catch {
                        setDeleting(false);
                      }
                    }}
                    className="font-pixel text-sm"
                  >
                    {deleting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Confirm Delete"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmText("");
                    }}
                    disabled={deleting}
                    className="font-pixel text-sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
