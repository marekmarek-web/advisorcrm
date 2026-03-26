import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";
import "../styles/aidvisora-theme.css";
import "../styles/aidvisora-components.css";
import { TooltipBlurListener } from "./components/TooltipBlurListener";
import { NativeOAuthDeepLinkBridge } from "./components/NativeOAuthDeepLinkBridge";
import { SpeedInsights } from "@vercel/speed-insights/next";

const sourceSans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
  variable: "--font-primary",
  display: "swap",
  preload: true,
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://aidvisora.cz";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  manifest: "/site.webmanifest",
  title: "Aidvisora – pracovní systém pro finanční poradce",
  description:
    "CRM, klientská zóna a workflow pro finanční poradce. Klienti, dokumenty, schůzky a úkoly na jednom místě — méně administrativy, více přehledu.",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon-192.webp", sizes: "192x192", type: "image/webp" },
      { url: "/icons/icon-512.webp", sizes: "512x512", type: "image/webp" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Aidvisora – pracovní systém pro finanční poradce",
    description:
      "CRM, klientská zóna a workflow pro finanční poradce. Klienti, dokumenty, schůzky a úkoly na jednom místě.",
    type: "website",
    locale: "cs_CZ",
    url: siteUrl,
    siteName: "Aidvisora",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aidvisora – pracovní systém pro finanční poradce",
    description:
      "CRM, klientská zóna a workflow pro finanční poradce. Klienti, dokumenty, schůzky a úkoly na jednom místě.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <body className={sourceSans.className}>
        <TooltipBlurListener />
        <NativeOAuthDeepLinkBridge />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
