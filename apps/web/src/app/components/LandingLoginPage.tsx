"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { MobileLoginView } from "./auth/MobileLoginView";
import { WebLoginView } from "./auth/WebLoginView";
import { useAidvisoraLogin } from "./auth/useAidvisoraLogin";

export function LandingLoginPage() {
  const login = useAidvisoraLogin();
  const [isNativeShell, setIsNativeShell] = useState(login.forceNative);

  useEffect(() => {
    setIsNativeShell(login.forceNative || Capacitor.isNativePlatform());
  }, [login.forceNative]);

  return isNativeShell ? <MobileLoginView login={login} /> : <WebLoginView login={login} />;
}
