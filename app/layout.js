import { Unbounded, Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import "./simey/cards.css";
import "./simey/base.css";
import "./simey/regular-holo.css";
import "./simey/rainbow-holo.css";
import "./simey/secret-rare.css";

const display = Unbounded({ subsets: ["latin"], weight: ["400", "600", "800"], variable: "--font-display" });
const body = Outfit({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-body" });

export const metadata = {
  title: "literally every CCG",
  description: "Every card game. One pack at a time. Rip packs of real cards from every CCG in existence.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}<Analytics /></body>
    </html>
  );
}
