import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Display: Bricolage Grotesque, a little indie-game character for headings.
// Body: Instrument Sans, neutral and readable at UI sizes.
// Self-hosted (src/app/fonts): next/font/google downloads at build time, which once failed a CI build.
const display = localFont({ src: "./fonts/BricolageGrotesque-latin.woff2", weight: "500 700", variable: "--font-display", display: "swap" });
const body = localFont({ src: "./fonts/InstrumentSans-latin.woff2", weight: "400 700", variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Playtest",
  description: "Private browser playtests with timestamped feedback",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
