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
import { ArrowLeft, LogOut, User, Users } from "lucide-react";

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
    <nav className="border-b-3 border-border bg-card pixel-border">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-3">
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
            className="font-pixel text-base text-primary cursor-pointer hover:opacity-80 transition-opacity pixel-glow"
          >
            PSC Quest
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <XPBar totalXP={totalXP} />

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
                <span className="hidden sm:inline">{displayName || "Profile"}</span>
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
