"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Swords,
  BookOpen,
  ClipboardCheck,
  Trophy,
  Users,
  UserCircle,
  ArrowRight,
  Volume2,
  VolumeX,
  Play,
  Flame,
} from "lucide-react";
import { getUserLevel } from "@/lib/gamification/xp";

const MENU_ITEMS = [
  {
    href: "/practice",
    icon: BookOpen,
    label: "Practice Session",
    description: "Train all 5 PSC components + supplementary drills",
  },
  {
    href: "/mock-exam",
    icon: ClipboardCheck,
    label: "Mock Exam",
    description: "Full 5-component exam simulation",
  },
  {
    href: "/leaderboard",
    icon: Trophy,
    label: "Leaderboard",
    description: "See how you rank",
  },
  {
    href: "/characters",
    icon: Users,
    label: "Characters",
    description: "Gallery, unlocks, and affection",
  },
];

interface DashboardClientProps {
  displayName: string | null;
  totalXP: number;
  loginStreak: number;
  charName: string | null;
  charImage: string | null;
  pendingCount: number;
  musicSrc: string;
}

export function DashboardClient({
  displayName,
  totalXP,
  loginStreak,
  charName,
  charImage,
  pendingCount,
  musicSrc,
}: DashboardClientProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [entered, setEntered] = useState(false);

  const { level, name: levelName, xpToNext } = getUserLevel(totalXP);
  const nextLevelXP = xpToNext ? totalXP + xpToNext : totalXP;
  const progress = xpToNext ? (totalXP / nextLevelXP) * 100 : 100;

  // Check sessionStorage on mount
  useEffect(() => {
    if (sessionStorage.getItem("dashboard_entered")) {
      setEntered(true);
    }
  }, []);

  // Create audio
  useEffect(() => {
    const audio = new Audio(musicSrc);
    audio.loop = true;
    audio.volume = 0.3;
    audio.preload = "auto";
    audioRef.current = audio;

    if (sessionStorage.getItem("dashboard_entered")) {
      audio.play().catch(() => {});
    }

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [musicSrc]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = muted;
  }, [muted]);

  const handleStart = () => {
    audioRef.current?.play().catch(() => {});
    setEntered(true);
    sessionStorage.setItem("dashboard_entered", "1");
  };

  // ── Splash screen — covers entire viewport including navbar ──
  if (!entered) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{
          backgroundImage: 'url("/img/background/main3.webp")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
      >
        <div className="pixel-border chinese-corner bg-card w-full max-w-md p-8 animate-fade-in-up mx-4">
          <div className="flex flex-col items-center gap-5">
            {/* Character */}
            <div className="relative h-36 w-36 pixel-border bg-muted overflow-hidden">
              {charImage ? (
                <Image
                  src={charImage}
                  alt={charName || "Character"}
                  fill
                  className="object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-base text-muted-foreground">
                  {charName || "?"}
                </div>
              )}
            </div>

            {/* Display name */}
            <p className="font-chinese-display text-2xl text-primary pixel-glow leading-relaxed animate-ink-fade">
              {displayName || "Adventurer"}
            </p>

            {/* Level + XP bar */}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-pixel text-base text-primary leading-relaxed">
                  Lv.{level} {levelName}
                </span>
                <span className="font-pixel text-base text-foreground leading-relaxed">
                  {totalXP.toLocaleString()} XP
                </span>
              </div>
              <div className="relative h-6 w-full border-2 border-border bg-muted overflow-hidden">
                <div
                  className="h-full bg-pixel-green transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center font-pixel text-xs text-foreground">
                  {xpToNext ? `${xpToNext} XP to next level` : "MAX LEVEL"}
                </span>
              </div>
            </div>

            {/* Login streak */}
            <div className="flex items-center gap-2 pixel-border bg-muted px-4 py-2">
              <Flame className="h-5 w-5 text-orange-500" />
              <span className="font-pixel text-base text-foreground leading-relaxed">
                {loginStreak} Day Streak
              </span>
            </div>

            {/* Divider */}
            <div className="w-full chinese-divider" />

            {/* Start button */}
            <button
              onClick={handleStart}
              className="pixel-btn bg-primary text-primary-foreground px-10 py-3 font-pixel text-sm leading-relaxed hover:brightness-110 transition-all flex items-center gap-3"
            >
              <Play className="h-4 w-4" />
              Start Journey
              <span className="font-chinese-display text-base opacity-80">开始冒险</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard content ──
  return (
    <div className="mx-auto max-w-2xl space-y-2.5">
      {/* Mute button */}
      <button
        onClick={() => setMuted((m) => !m)}
        className="fixed bottom-4 right-4 z-50 pixel-border bg-card p-2 hover:pixel-border-primary transition-all"
        aria-label={muted ? "Unmute music" : "Mute music"}
      >
        {muted ? (
          <VolumeX className="h-5 w-5 text-muted-foreground" />
        ) : (
          <Volume2 className="h-5 w-5 text-primary" />
        )}
      </button>

      {/* Greeting with character */}
      <div className="flex justify-center">
        <Image
          src="/img/background/Logo.webp"
          alt="XiYouQuest"
          width={581}
          height={194}
          className="object-contain"
        />
      </div>

      {/* Main Quest */}
      <Link href="/main-quest" className="group block">
        <div className="pixel-border chinese-corner bg-card px-4 py-2 hover:pixel-border-primary transition-all">
          <div className="flex items-center gap-4">
            <Swords className="h-6 w-6 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-pixel text-sm text-foreground leading-relaxed">
                Main Quest
              </p>
              <p className="text-sm text-muted-foreground">
                Journey to the West — Story Campaign
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </Link>

      {/* Menu tiles */}
      {MENU_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className="group block">
          <div className="pixel-border chinese-corner bg-card px-4 py-2 hover:pixel-border-primary transition-all">
            <div className="flex items-center gap-4">
              <item.icon className="h-6 w-6 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-pixel text-sm text-foreground leading-relaxed">
                  {item.label}
                </p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </Link>
      ))}

      {/* Achievements */}
      <Link href="/achievements" className="group block">
        <div className="pixel-border chinese-corner bg-card px-4 py-2 hover:pixel-border-primary transition-all">
          <div className="flex items-center gap-4">
            <Trophy className="h-6 w-6 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-pixel text-sm text-foreground leading-relaxed">
                Achievements
              </p>
              <p className="text-sm text-muted-foreground">Track your milestones</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </Link>

      {/* Profile / Social row */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/profile" className="group block">
          <div className="pixel-border chinese-corner bg-card px-4 py-2 hover:pixel-border-primary transition-all flex items-center gap-4">
            <UserCircle className="h-6 w-6 text-primary shrink-0" />
            <p className="font-pixel text-sm text-foreground leading-relaxed">Profile</p>
          </div>
        </Link>
        <Link href="/social" className="group block">
          <div className="pixel-border chinese-corner bg-card px-4 py-2 hover:pixel-border-primary transition-all flex items-center gap-4">
            <Users className="h-6 w-6 text-primary shrink-0" />
            <p className="font-pixel text-sm text-foreground leading-relaxed">Social</p>
            {pendingCount > 0 && (
              <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold bg-primary text-primary-foreground pixel-border">
                {pendingCount}
              </span>
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}
