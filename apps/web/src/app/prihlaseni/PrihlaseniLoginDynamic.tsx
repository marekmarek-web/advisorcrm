"use client";

import nextDynamic from "next/dynamic";

function LoginFallback() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(60deg, #10121f 0%, #1a1c2e 100%)", fontFamily: "var(--wp-font)" }}
    >
      <p className="text-white/70 text-sm">Načítám…</p>
    </div>
  );
}

const LandingLoginPageClient = nextDynamic(
  () => import("../components/LandingLoginPage").then((mod) => ({ default: mod.LandingLoginPage })),
  {
    ssr: false,
    loading: () => <LoginFallback />,
  }
);

export function PrihlaseniLoginDynamic({ nativeFromUrl }: { nativeFromUrl: boolean }) {
  return <LandingLoginPageClient nativeFromUrl={nativeFromUrl} />;
}
