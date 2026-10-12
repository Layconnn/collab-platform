import type { Metadata } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cormorantDisplay = Cormorant_Garamond({
  variable: "--font-cormorant-display",
  subsets: ["latin"],
  weight: "600",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Commons | Open-source communities",
  description: "A welcoming place for open-source communities to share ideas, ask questions, and build together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${cormorantDisplay.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
