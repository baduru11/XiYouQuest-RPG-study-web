"use client";

import { Navbar } from "@/components/shared/navbar";

interface NavbarClientProps {
  totalXP: number;
  displayName: string | null;
  avatarUrl: string | null;
  pendingRequestCount: number;
}

export function NavbarClient({ totalXP, displayName, avatarUrl, pendingRequestCount }: NavbarClientProps) {
  return <Navbar totalXP={totalXP} displayName={displayName} avatarUrl={avatarUrl} pendingRequestCount={pendingRequestCount} />;
}
