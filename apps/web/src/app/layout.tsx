import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";
import "../styles/monday.css";
import "../styles/weplan-theme.css";
import "../styles/weplan-components.css";
import "../styles/weplan-calendar.css";
import { TooltipBlurListener } from "./components/TooltipBlurListener";

const sourceSans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-primary",
});

export const metadata: Metadata = {
  title: "Aidvisora – Portál poradce",
  description: "CRM pro finanční poradce v ČR. Domácnosti, pipeline, meeting notes, smlouvy.",
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
        {children}
      </body>
    </html>
  );
}
