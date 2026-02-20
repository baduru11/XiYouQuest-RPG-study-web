"use client";

import dynamic from "next/dynamic";

const Navbar = dynamic(
  () => import("@/components/shared/navbar").then((m) => ({ default: m.Navbar })),
  {
    ssr: false,
    loading: () => <NavbarSkeleton />,
  }
);

interface NavbarClientProps {
  totalXP: number;
  displayName: string | null;
  avatarUrl: string | null;
  pendingRequestCount: number;
}

function NavbarSkeleton() {
  return (
    <nav className="border-b-3 border-border bg-card pixel-border">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <img
            src="/img/background/Logo.webp"
            alt="XiYouQuest"
            width={120}
            height={40}
            className="object-contain"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-28 border-2 border-border bg-muted" />
          </div>
        </div>
      </div>
    </nav>
  );
}

export function NavbarClient({ totalXP, displayName, avatarUrl, pendingRequestCount }: NavbarClientProps) {
  return <Navbar totalXP={totalXP} displayName={displayName} avatarUrl={avatarUrl} pendingRequestCount={pendingRequestCount} />;
}
