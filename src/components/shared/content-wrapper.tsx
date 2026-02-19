"use client";

import { usePathname } from "next/navigation";

export function ContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/dashboard") {
    return <>{children}</>;
  }

  const isPassageReading = pathname === "/component-4";

  return (
    <div className={`pixel-border backdrop-blur-sm p-8 ${isPassageReading ? "bg-card/50" : "bg-card/80"}`}>
      {children}
    </div>
  );
}
