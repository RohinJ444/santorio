import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for the greeting name: technical, HUD-like.
const chakra = Chakra_Petch({
  variable: "--font-chakra",
  weight: "600",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Santorio",
  description: "Energy in, energy out, and everything in between.",
  applicationName: "Santorio",
  appleWebApp: {
    capable: true,
    title: "Santorio",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#03060c",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${chakra.variable}`}>
      <body>
        <AppShell />
        {children}
      </body>
    </html>
  );
}
