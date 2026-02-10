"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { XPBar } from "./xp-bar";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Menu, LogOut } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home" },
  { href: "/component-1", label: "C1" },
  { href: "/component-2", label: "C2" },
  { href: "/component-3", label: "C3" },
  { href: "/component-4", label: "C4" },
  { href: "/component-5", label: "C5" },
  { href: "/characters", label: "Party" },
];

export function Navbar({ totalXP }: { totalXP: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <nav className="border-b-3 border-border bg-card pixel-border">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="font-pixel text-sm text-primary cursor-pointer hover:opacity-80 transition-opacity pixel-glow"
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

          {/* Desktop sign out */}
          <div className="hidden md:block">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Sign out">
                  <LogOut className="h-4 w-4 mr-1" />
                  <span className="hidden lg:inline">Quit</span>
                </Button>
              </AlertDialogTrigger>
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
                <SheetTitle className="font-pixel text-xs">Menu</SheetTitle>
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

                <div className="border-t-2 border-border pt-2 mt-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" className="w-full justify-start text-destructive">
                        <LogOut className="h-4 w-4 mr-2" />
                        Quit
                      </Button>
                    </AlertDialogTrigger>
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
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
