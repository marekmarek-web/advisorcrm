import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";
import "../styles/monday.css";
import "../styles/weplan-theme.css";
import "../styles/weplan-components.css";
import "../styles/weplan-calendar.css";
import { TooltipBlurListener } from "./components/TooltipBlurListener";
import { NativeOAuthDeepLinkBridge } from "./components/NativeOAuthDeepLinkBridge";
import { SpeedInsights } from "@vercel/speed-insights/next";

const sourceSans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-primary",
});

export const metadata: Metadata = {
  title: "Aidvisora – pracovní systém pro finanční poradce",
  description:
    "Přestaňte řídit poradenství přes Excel, e-mail a WhatsApp. Klienti, podklady, úkoly a obchody přehledně na jednom místě — CRM, portál, dokumenty a pipeline pro poradce a týmy.",
  icons: { icon: "/favicon.png", apple: "/favicon.png" },
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
    <html lang="cs">
      <body className={sourceSans.className}>
        <TooltipBlurListener />
        <NativeOAuthDeepLinkBridge />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
