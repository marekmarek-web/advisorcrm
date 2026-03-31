"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { MobileLoginView } from "./auth/MobileLoginView";
import { WebLoginView } from "./auth/WebLoginView";
import { useAidvisoraLogin } from "./auth/useAidvisoraLogin";

type Props = {
  /** Z serverové stránky `/prihlaseni` — musí odpovídat `?native=1` v URL requestu (hydratace v appce). */
  nativeFromUrl?: boolean;
};

export function LandingLoginPage({ nativeFromUrl = false }: Props) {
  const login = useAidvisoraLogin();
  const [isNativeShell, setIsNativeShell] = useState(nativeFromUrl);

  useEffect(() => {
    setIsNativeShell(nativeFromUrl || login.forceNative || Capacitor.isNativePlatform());
  }, [nativeFromUrl, login.forceNative]);

  return isNativeShell ? <MobileLoginView login={login} /> : <WebLoginView login={login} />;
}
