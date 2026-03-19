"use client";

import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

type ThemeId = "original" | "darkElegance";

interface LandingHeaderProps {
  activeTheme: ThemeId;
}

const linkBase =
  "min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-4 py-3 rounded-xl font-medium transition-all duration-300";
const linkStyles = {
  original: "text-white/90 hover:text-white hover:bg-white/10",
  darkElegance: "text-white/90 hover:text-white hover:bg-white/10",
};

export function LandingHeader({ activeTheme }: LandingHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const style = linkStyles[activeTheme];

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    if (!mobileOpen) return;
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [mobileOpen]);

  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/20 backdrop-blur-md transition-colors duration-300"
      role="banner"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex min-h-[44px] min-w-[44px] items-center focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent rounded-lg"
          aria-label="Aidvisora – úvod"
        >
          <img
            src="/aidvisora-logo.png"
            alt="Aidvisora"
            className="h-10 w-auto max-w-[200px] object-contain sm:h-12 sm:max-w-[240px]"
            width={240}
            height={48}
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Hlavní navigace">
          <a href="#login" className={`${linkBase} ${style}`}>
            Přihlásit se
          </a>
          <Link href="/klientska-zona" className={`${linkBase} ${style}`}>
            Klientská zóna
          </Link>
          <Link href="/portal" className={`${linkBase} ${style}`}>
            Portál poradce
          </Link>
        </nav>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-white/90 hover:bg-white/10 hover:text-white md:hidden"
          aria-expanded={mobileOpen}
          aria-controls="landing-mobile-nav"
          aria-label={mobileOpen ? "Zavřít menu" : "Otevřít menu"}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile drawer */}
      <div
        id="landing-mobile-nav"
        className={`border-t border-white/10 bg-black/30 backdrop-blur-md md:hidden ${mobileOpen ? "block" : "hidden"}`}
        aria-hidden={!mobileOpen}
      >
        <nav className="flex flex-col gap-1 px-4 py-3 pb-4" aria-label="Mobilní navigace">
          <a
            href="#login"
            onClick={closeMobile}
            className={`${linkBase} justify-start rounded-xl ${style}`}
          >
            Přihlásit se
          </a>
          <Link
            href="/klientska-zona"
            onClick={closeMobile}
            className={`${linkBase} justify-start rounded-xl ${style}`}
          >
            Klientská zóna
          </Link>
          <Link
            href="/portal"
            onClick={closeMobile}
            className={`${linkBase} justify-start rounded-xl ${style}`}
          >
            Portál poradce
          </Link>
        </nav>
      </div>
    </header>
  );
}
