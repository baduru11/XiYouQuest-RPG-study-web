"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { XPBar } from "./xp-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import {
  ArrowLeft,
  Award,
  History,
  LogOut,
  Medal,
  Menu,
  Palette,
  Settings,
  User,
  Users,
} from "lucide-react";
import { SettingsDialog } from "./settings-dialog";
import Image from "next/image";

const NAV_LINKS = [
  { href: "/leaderboard", icon: Medal, label: "Leaderboard" },
  { href: "/characters", icon: Palette, label: "Characters" },
  { href: "/achievements", icon: Award, label: "Achievements" },
  { href: "/practice-history", icon: History, label: "History" },
] as const;

interface NavbarProps {
  totalXP: number;
  displayName: string | null;
  avatarUrl: string | null;
  pendingRequestCount: number;
}

export function Navbar({ totalXP, displayName, avatarUrl, pendingRequestCount }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const showBackToHub = pathname !== "/dashboard";
  const isComponentPage = /^\/component-\d+/.test(pathname);
  const backHref = isComponentPage ? "/practice" : "/dashboard";
  const backLabel = isComponentPage ? "Practice" : "Hub";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <TooltipProvider delayDuration={0}>
    <nav className="border-b-3 border-border bg-card chinese-frame">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-10">
        {/* Left: Back + Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          {showBackToHub && (
            <Link href={backHref}>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{backLabel}</span>
              </Button>
            </Link>
          )}
          <Link
            href="/dashboard"
            className="cursor-pointer hover:opacity-80 transition-opacity"
          >
            <Image
              src="/img/background/Logo.webp"
              alt="XiYouQuest"
              width={120}
              height={40}
              className="object-contain w-[80px] sm:w-[120px]"
            />
          </Link>
        </div>

        {/* Center: Desktop nav links */}
        <div className="hidden md:flex items-center gap-1.5">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link key={link.href} href={link.href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`gap-2 font-pixel text-sm px-3 py-2 transition-colors ${
                    isActive
                      ? "text-primary bg-primary/15 pixel-border"
                      : "text-foreground/80 hover:text-primary hover:bg-primary/10"
                  }`}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Button>
              </Link>
            );
          })}
        </div>

        {/* Right: XP + Hamburger (mobile) + Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4">
          <XPBar totalXP={totalXP} />

          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden p-1.5"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Desktop profile dropdown — hidden on mobile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:flex items-center gap-1.5"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    width={20}
                    height={20}
                    className="rounded-sm object-cover"
                  />
                ) : (
                  <User className="h-4 w-4" />
                )}
                <span>{displayName || "Profile"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem] p-2">
              <DropdownMenuItem onClick={() => router.push("/profile")} className="text-lg font-bold px-3 py-2.5 gap-3">
                <User className="h-5 w-5" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/social")} className="text-lg font-bold px-3 py-2.5 gap-3">
                <Users className="h-5 w-5" />
                Social
                {pendingRequestCount > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold bg-primary text-primary-foreground pixel-border">
                    {pendingRequestCount}
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSettingsOpen(true)} className="text-lg font-bold px-3 py-2.5 gap-3">
                <Settings className="h-5 w-5" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setLogoutOpen(true)}
                className="text-lg font-bold px-3 py-2.5 gap-3 text-destructive focus:text-destructive"
              >
                <LogOut className="h-5 w-5" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>

    {/* Mobile navigation sheet */}
    <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
      <SheetContent side="right" className="w-[280px] bg-card p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 pixel-border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <SheetTitle className="font-pixel text-base text-foreground truncate">
                {displayName || "Traveler"}
              </SheetTitle>
            </div>
          </div>
        </SheetHeader>
        <nav className="flex flex-col gap-1 p-3">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <SheetClose key={link.href} asChild>
                <Link
                  href={link.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-sm font-pixel text-sm transition-colors ${
                    isActive
                      ? "text-primary bg-primary/10 pixel-border"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <link.icon className="h-5 w-5 shrink-0" />
                  {link.label}
                </Link>
              </SheetClose>
            );
          })}
          <div className="my-2 chinese-divider" />
          <SheetClose asChild>
            <Link
              href="/profile"
              className={`flex items-center gap-3 px-4 py-3 rounded-sm font-pixel text-sm transition-colors ${
                pathname === "/profile"
                  ? "text-primary bg-primary/10 pixel-border"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <User className="h-5 w-5 shrink-0" />
              Profile
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link
              href="/social"
              className={`flex items-center gap-3 px-4 py-3 rounded-sm font-pixel text-sm transition-colors ${
                pathname === "/social"
                  ? "text-primary bg-primary/10 pixel-border"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <Users className="h-5 w-5 shrink-0" />
              Social
              {pendingRequestCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold bg-primary text-primary-foreground pixel-border">
                  {pendingRequestCount}
                </span>
              )}
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-3 px-4 py-3 rounded-sm font-pixel text-sm text-foreground hover:bg-muted transition-colors w-full text-left"
            >
              <Settings className="h-5 w-5 shrink-0" />
              Settings
            </button>
          </SheetClose>
          <div className="my-2 chinese-divider" />
          <SheetClose asChild>
            <button
              onClick={() => setLogoutOpen(true)}
              className="flex items-center gap-3 px-4 py-3 rounded-sm font-pixel text-sm text-destructive hover:bg-muted transition-colors w-full text-left"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              Log Out
            </button>
          </SheetClose>
        </nav>
      </SheetContent>
    </Sheet>

    <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save & Quit?</AlertDialogTitle>
          <AlertDialogDescription>
            Your progress is saved. You can sign back in anytime to continue your quest.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSignOut}>
            Quit Game
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </TooltipProvider>
  );
}
