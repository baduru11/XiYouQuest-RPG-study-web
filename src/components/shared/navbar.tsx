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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import { Menu, LogOut, User, Users } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home" },
  { href: "/component-1", label: "C1" },
  { href: "/component-2", label: "C2" },
  { href: "/component-3", label: "C3" },
  { href: "/component-4", label: "C4" },
  { href: "/component-5", label: "C5" },
  { href: "/characters", label: "Character" },
  { href: "/leaderboard", label: "Ranks" },
];

interface NavbarProps {
  totalXP: number;
  displayName: string | null;
  avatarUrl: string | null;
  pendingRequestCount: number;
}

export function Navbar({ totalXP, displayName, avatarUrl, pendingRequestCount }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <TooltipProvider delayDuration={0}>
    <nav className="border-b-3 border-border bg-card pixel-border">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="font-pixel text-base text-primary cursor-pointer hover:opacity-80 transition-opacity pixel-glow"
          >
            PSC Quest
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={pathname.startsWith(item.href) ? "default" : "ghost"}
                  size="sm"
                  className={pathname.startsWith(item.href) ? "pixel-border-primary" : ""}
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:block">
            <XPBar totalXP={totalXP} />
          </div>

          {/* Desktop profile dropdown */}
          <div className="hidden md:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1.5"
                >
                  {avatarUrl ? (
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
                  <span className="hidden lg:inline">{displayName || "Profile"}</span>
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

          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 bg-card">
              <SheetHeader>
                <SheetTitle className="font-pixel text-sm">Menu</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-2 mt-6">
                {/* Mobile XP bar */}
                <div className="sm:hidden mb-4">
                  <XPBar totalXP={totalXP} />
                </div>

                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Button
                      variant={pathname.startsWith(item.href) ? "default" : "ghost"}
                      className="w-full justify-start"
                    >
                      {item.label}
                    </Button>
                  </Link>
                ))}

                <Link href="/profile" onClick={() => setMobileOpen(false)}>
                  <Button
                    variant={pathname.startsWith("/profile") ? "default" : "ghost"}
                    className="w-full justify-start"
                  >
                    <User className="h-4 w-4 mr-2" />
                    Profile
                  </Button>
                </Link>

                <Link href="/social" onClick={() => setMobileOpen(false)}>
                  <Button
                    variant={pathname.startsWith("/social") ? "default" : "ghost"}
                    className="w-full justify-start"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Social
                    {pendingRequestCount > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold bg-primary text-primary-foreground pixel-border">
                        {pendingRequestCount}
                      </span>
                    )}
                  </Button>
                </Link>

                <div className="border-t-2 border-border pt-2 mt-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-destructive"
                    onClick={() => {
                      setMobileOpen(false);
                      setLogoutOpen(true);
                    }}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Log Out
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
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
    </TooltipProvider>
  );
}
