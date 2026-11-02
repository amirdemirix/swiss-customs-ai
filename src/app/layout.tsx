import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = { title: "Swiss Customs AI", description: "Verzollungsvorbereitung für Schweizer Zolldeklaranten" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-CH" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
