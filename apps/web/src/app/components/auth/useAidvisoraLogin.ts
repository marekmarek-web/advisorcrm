"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { createClient } from "@/lib/supabase/client";
import { acceptClientInvitation } from "@/app/actions/auth";

export type LoginRole = "advisor" | "client";

export function normalizeNextParam(raw: string | null, fallback: string) {
  if (!raw || !raw.startsWith("/")) return fallback;
  if (raw === "/" || raw === "/prihlaseni" || raw === "/login" || raw === "/register") return fallback;
  return raw;
}

export function getInitialLoginMessage(errorParam: string | null): string {
  if (!errorParam) return "";
  if (errorParam === "otp_expired") return "Odkaz z e-mailu vypršel. Přihlaste se heslem nebo zaregistrujte se znovu.";
  if (errorParam === "database_error") return "Problém s připojením k databázi. Zkuste to za chvíli znovu.";
  if (errorParam === "auth_error") return "Přihlášení se nezdařilo. Zkontrolujte údaje nebo to zkuste znovu po chvíli.";
  try {
    return decodeURIComponent(errorParam);
  } catch {
    return errorParam;
  }
}

function isNativeRuntime() {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.() || Capacitor.isNativePlatform());
}

export function useAidvisoraLogin() {
  const searchParams = useSearchParams();
  const forceNative = searchParams.get("native") === "1";
  const nextParam = searchParams.get("next");
  const advisorNextPath = normalizeNextParam(nextParam, "/portal/today");
  const clientNextPath = normalizeNextParam(nextParam, "/client");
  const token = searchParams.get("token");
  const registerParam = searchParams.get("register");
  const errorParam = searchParams.get("error");

  const [role, setRole] = useState<LoginRole>(() => (token ? "client" : "advisor"));
  const [isLogin, setIsLogin] = useState(() => !registerParam && !token);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [gdprConsent, setGdprConsent] = useState(false);
  const [message, setMessage] = useState(() => getInitialLoginMessage(errorParam));
  const [isMounted, setIsMounted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (token) setRole("client");
  }, [token]);

  useEffect(() => {
    if (!forceNative || typeof document === "undefined") return;
    document.cookie = "mobile_ui_v1_beta=1; Path=/; Max-Age=31536000; SameSite=Lax";
  }, [forceNative]);

  const isClient = role === "client";
  const hasError = Boolean(message);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setMessage("");

      const supabase = createClient();

      if (token) {
        let { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const isInvalidCredentials =
            error.message.toLowerCase().includes("invalid") || error.message.toLowerCase().includes("credentials");
          if (isInvalidCredentials) {
            const signUpRes = await supabase.auth.signUp({ email, password });
            error = signUpRes.error;
            if (
              error?.message?.toLowerCase().includes("already registered") ||
              error?.message?.toLowerCase().includes("already exists")
            ) {
              setMessage("Tento e-mail již má účet. Zadejte své heslo a odešlete znovu (přihlášení).");
              setIsLoading(false);
              return;
            }
          }
        }
        if (error) {
          setIsLoading(false);
          setMessage(error.message);
          return;
        }
        const result = await acceptClientInvitation(token, gdprConsent);
        setIsLoading(false);
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        window.location.href = "/client";
        return;
      }

      if (role === "client") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setIsLoading(false);
        if (error) {
          setMessage(error.message);
          return;
        }
        window.location.href = `/register/complete?next=${encodeURIComponent(clientNextPath)}`;
        return;
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setIsLoading(false);
        if (error) {
          setMessage(error.message);
          return;
        }
        window.location.href = `/register/complete?next=${encodeURIComponent(advisorNextPath)}`;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        });
        setIsLoading(false);
        if (error) {
          if (error.message.toLowerCase().includes("rate limit") || error.message.toLowerCase().includes("email rate")) {
            setMessage("Příliš mnoho pokusů. Zkuste to za 10–15 minut.");
          } else {
            setMessage(error.message);
          }
          return;
        }
        window.location.href = `/register/complete?next=${encodeURIComponent(advisorNextPath)}`;
      }
    },
    [token, email, password, gdprConsent, role, isLogin, name, clientNextPath, advisorNextPath]
  );

  const handleOAuthSignIn = useCallback(
    async (provider: "google" | "apple") => {
      const supabase = createClient();
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const nextPath = role === "client" ? clientNextPath : advisorNextPath;
      const encodedNext = encodeURIComponent(nextPath);
      const isNative = forceNative || isNativeRuntime();
      const redirectTo = isNative
        ? `${baseUrl}/auth/callback?native=1&next=${encodedNext}`
        : `${baseUrl}/auth/callback?next=${encodedNext}`;

      if (isNative) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        });
        if (error) {
          setMessage(error.message);
          return;
        }
        if (data?.url) {
          await Browser.open({ url: data.url, windowName: "_self" });
        }
        return;
      }

      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
    },
    [forceNative, role, clientNextPath, advisorNextPath]
  );

  const handleBiometricLogin = useCallback(() => {
    if (isLoading) return;
    if (!isLogin && !token) {
      setMessage("Biometrické přihlášení je dostupné pouze pro přihlášení.");
      return;
    }
    formRef.current?.requestSubmit();
  }, [isLoading, isLogin, token]);

  return {
    forceNative,
    token,
    registerParam,
    advisorNextPath,
    clientNextPath,
    role,
    setRole,
    isLogin,
    setIsLogin,
    showPassword,
    setShowPassword,
    isLoading,
    email,
    setEmail,
    password,
    setPassword,
    name,
    setName,
    gdprConsent,
    setGdprConsent,
    message,
    setMessage,
    isMounted,
    isClient,
    hasError,
    formRef,
    handleSubmit,
    handleOAuthSignIn,
    handleBiometricLogin,
  };
}

export type AidvisoraLoginState = ReturnType<typeof useAidvisoraLogin>;
