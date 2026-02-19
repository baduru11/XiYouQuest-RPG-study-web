"use client";

import { usePathname } from "next/navigation";

/* Shared styles extracted as constants to keep JSX readable */

const ROLLER_GRADIENT =
  "linear-gradient(180deg, #4A2510 0%, #6B3410 8%, #8B4513 20%, #B87A42 42%, #D4A06A 50%, #B87A42 58%, #8B4513 80%, #6B3410 92%, #4A2510 100%)";

const KNOB_GRADIENT =
  "linear-gradient(180deg, #6B3410 0%, #8B4513 25%, #A0622D 50%, #8B4513 75%, #6B3410 100%)";

const KNOB_BASE: React.CSSProperties = {
  position: "absolute",
  top: -4,
  width: 10,
  height: "calc(100% + 8px)",
  background: KNOB_GRADIENT,
  border: "3px solid #3D1F0A",
  boxShadow: "inset 0 1px 0 0 rgba(196,136,74,0.3)",
  zIndex: 1,
};

export function ContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/dashboard") {
    return <>{children}</>;
  }

  const isPassageReading = pathname === "/component-4";

  return (
    <div style={{ position: "relative", marginTop: 12, marginBottom: 16 }}>
      {/* ── Top scroll roller (挂杆) ── */}
      <div
        style={{
          position: "absolute",
          top: -8,
          left: -10,
          right: -10,
          height: 16,
          zIndex: 10,
          pointerEvents: "none",
          border: "3px solid #3D1F0A",
          background: ROLLER_GRADIENT,
          boxShadow: "0 3px 0 0 #2A1508, inset 0 1px 0 0 rgba(212,160,106,0.4)",
        }}
      >
        {/* Left knob */}
        <div style={{ ...KNOB_BASE, left: -7 }} />
        {/* Right knob */}
        <div style={{ ...KNOB_BASE, right: -7 }} />
      </div>

      {/* ── Scroll body (rice paper) ── */}
      <div
        className={`backdrop-blur-sm px-9 py-8 ${
          isPassageReading ? "bg-card/50" : "bg-card/80"
        }`}
        style={{
          borderLeft: "3px solid #8B4513",
          borderRight: "3px solid #8B4513",
          boxShadow: [
            /* side depth — paper curving away from viewer */
            "inset 6px 0 10px -6px rgba(92,45,14,0.3)",
            "inset -6px 0 10px -6px rgba(92,45,14,0.3)",
            /* top/bottom paper-curl shadows near rollers */
            "inset 0 8px 10px -8px rgba(92,45,14,0.25)",
            "inset 0 -8px 10px -8px rgba(92,45,14,0.25)",
          ].join(", "),
        }}
      >
        {children}
      </div>

      {/* ── Bottom scroll roller (轴) — heavier weight rod ── */}
      <div
        style={{
          position: "absolute",
          bottom: -10,
          left: -10,
          right: -10,
          height: 20,
          zIndex: 10,
          pointerEvents: "none",
          border: "3px solid #3D1F0A",
          background: ROLLER_GRADIENT,
          boxShadow: "0 4px 0 0 #2A1508, inset 0 1px 0 0 rgba(212,160,106,0.4)",
        }}
      >
        {/* Left knob */}
        <div style={{ ...KNOB_BASE, left: -7 }} />
        {/* Right knob */}
        <div style={{ ...KNOB_BASE, right: -7 }} />
      </div>
    </div>
  );
}
