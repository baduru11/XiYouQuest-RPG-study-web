import type { Metadata } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";
import "./globals.css";

const pressStart = Press_Start_2P({
  weight: "400",
  variable: "--font-pixel",
  subsets: ["latin"],
});

const vt323 = VT323({
  weight: "400",
  variable: "--font-retro",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PSC Study Companion",
  description: "Master the Putonghua Proficiency Test with AI-powered practice",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${pressStart.variable} ${vt323.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
