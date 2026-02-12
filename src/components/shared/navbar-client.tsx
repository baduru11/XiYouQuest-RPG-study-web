"use client";

import dynamic from "next/dynamic";

const Navbar = dynamic(
  () => import("@/components/shared/navbar").then((m) => m.Navbar),
  {
    ssr: false,
    loading: () => (
      <nav className="border-b-3 border-border bg-card pixel-border">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4" />
      </nav>
    ),
  }
);

interface NavbarClientProps {
  totalXP: number;
  displayName: string | null;
  avatarUrl: string | null;
  pendingRequestCount: number;
}

export function NavbarClient({ totalXP, displayName, avatarUrl, pendingRequestCount }: NavbarClientProps) {
  return <Navbar totalXP={totalXP} displayName={displayName} avatarUrl={avatarUrl} pendingRequestCount={pendingRequestCount} />;
}
