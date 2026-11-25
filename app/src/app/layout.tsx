import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Is it fair food? · Catfooding on BNB Chain",
  description:
    "A cat that checks tokenized US stocks on BNB Chain against the real share, with Atlas Oracle and CoinMarketCap data, and records its verdicts on-chain. Readings, not advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${bricolage.variable} ${plexMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
