import type { Metadata, Viewport } from "next";
import { Source_Sans_3, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "../styles/aidvisora-theme.css";
import "../styles/aidvisora-components.css";
import { TooltipBlurListener } from "./components/TooltipBlurListener";
import { NativeOAuthDeepLinkBridge } from "./components/NativeOAuthDeepLinkBridge";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { SpeedInsights } from "@vercel/speed-insights/next";

const sourceSans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
  variable: "--font-primary",
  display: "swap",
  preload: true,
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
  /** Druhý font — neblokuje LCP; primární text je Source Sans. */
  preload: false,
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
    /** Tab favicon: PNG only so browsers do not pick legacy WebP tiles with baked-in padding. */
    icon: [{ url: "/favicon.png", sizes: "512x512", type: "image/png" }],
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
      <body className={`${sourceSans.className} ${plusJakarta.variable}`}>
        <TooltipBlurListener />
        <NativeOAuthDeepLinkBridge />
        <ConfirmProvider>{children}</ConfirmProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
