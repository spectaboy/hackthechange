import type { Metadata } from "next";
import { Outfit, DM_Serif_Display, Geist_Mono } from "next/font/google";
import "./globals.css";

const uiSans = Outfit({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const display = DM_Serif_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mediqueue",
  description: "Zero wasted slots. Zero wasted trips. Sustainable, inclusive scheduling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${uiSans.variable} ${display.variable} ${geistMono.variable} antialiased font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
