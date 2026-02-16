"use client";

import { usePathname } from "next/navigation";

export function ContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/dashboard") {
    return <>{children}</>;
  }

  return (
    <div className="pixel-border bg-card/80 backdrop-blur-sm p-8">
      {children}
    </div>
  );
}
