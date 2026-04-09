"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { createClient } from "@/lib/supabase/client";
import { continueClientInvitationAfterLogin, ensureClientPortalAccess } from "@/app/actions/auth";
import {
  CLIENT_INVITE_QUERY_PARAM,
  parseClientInviteTokenFromUrl,
  buildClientInvitePasswordSetupSearch,
} from "@/lib/auth/client-invite-url";
import {
  STAFF_INVITE_QUERY_PARAM,
  parseStaffInviteTokenFromUrl,
  buildStaffInviteRegisterCompletePath,
} from "@/lib/auth/staff-invite-url";

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
  if (errorParam === "client_no_access") {
    return "Účet nemá přiřazený klientský přístup. Požádejte svého poradce o pozvánku (e-mail s odkazem) nebo použijte odkaz z pozvánky.";
  }
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

function isClientPortalDestination(path: string): boolean {
  return path === "/client" || path.startsWith("/client/");
}

export function useAidvisoraLogin() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const forceNative = searchParams.get("native") === "1";
  const nextParam = searchParams.get("next");
  const pendingMfaParam = searchParams.get("pending_mfa") === "1";
  const advisorNextPath = normalizeNextParam(nextParam, "/portal/today");
  const clientNextPath = normalizeNextParam(nextParam, "/client");
  const clientInviteToken = parseClientInviteTokenFromUrl(searchParams);
  const staffInviteToken = clientInviteToken ? null : parseStaffInviteTokenFromUrl(searchParams);
  const registerParam = searchParams.get("register");
  const errorParam = searchParams.get("error");

  const [role, setRole] = useState<LoginRole>(() => (clientInviteToken ? "client" : "advisor"));
  const [isLogin, setIsLogin] = useState(
    () => (clientInviteToken || staffInviteToken ? true : !searchParams.get("register")),
  );
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mfaPending, setMfaPending] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  /** Souhlas s OP / privacy / DPA + AI info při registraci poradce (e-mail i OAuth). */
  const [advisorLegalConsent, setAdvisorLegalConsent] = useState(false);
  const [message, setMessage] = useState(() => getInitialLoginMessage(errorParam));
  const [isMounted, setIsMounted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (clientInviteToken) setRole("client");
  }, [clientInviteToken]);

  useEffect(() => {
    const tok = clientInviteToken ?? staffInviteToken;
    const param = clientInviteToken ? CLIENT_INVITE_QUERY_PARAM : STAFF_INVITE_QUERY_PARAM;
    if (!tok) return;
    let cancelled = false;
    void fetch(`/api/invite/metadata?${param}=${encodeURIComponent(tok)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; email?: string } | null) => {
        if (cancelled || !data?.ok || typeof data.email !== "string") return;
        setEmail(data.email);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientInviteToken, staffInviteToken]);

  useEffect(() => {
    if (!forceNative || typeof document === "undefined") return;
    document.cookie = "mobile_ui_v1_beta=1; Path=/; Max-Age=31536000; SameSite=Lax";
  }, [forceNative]);

  useEffect(() => {
    if (isLogin) setAdvisorLegalConsent(false);
  }, [isLogin]);

  useEffect(() => {
    if (role === "client") setAdvisorLegalConsent(false);
  }, [role]);

  /** Po OAuth / dokončení TOTP: klient → ensure přístup; poradce → provision přes register/complete. */
  const navigateAfterAuthSessionReady = useCallback(async (targetNext: string) => {
    const dest = normalizeNextParam(targetNext, "/portal/today");
    if (isClientPortalDestination(dest)) {
      const access = await ensureClientPortalAccess();
      if (!access.ok) {
        window.location.href = `/prihlaseni?error=${encodeURIComponent(access.error)}`;
        return;
      }
      window.location.href = access.redirectTo ?? "/client";
      return;
    }
    window.location.href = `/register/complete?next=${encodeURIComponent(dest)}`;
  }, []);

  useEffect(() => {
    if (!pendingMfaParam) return;
    const ac = new AbortController();
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (ac.signal.aborted) return;
      if (!session) {
        window.location.replace("/prihlaseni");
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (ac.signal.aborted) return;
      const dest = normalizeNextParam(nextParam, "/portal/today");
      if (aal?.currentLevel === "aal2" || aal?.nextLevel !== "aal2") {
        await navigateAfterAuthSessionReady(dest);
        return;
      }
      const { data: fac, error: facErr } = await supabase.auth.mfa.listFactors();
      if (ac.signal.aborted) return;
      if (facErr) {
        setMessage(facErr.message);
        await supabase.auth.signOut();
        return;
      }
      const totp = fac?.totp?.find((f) => f.status === "verified");
      if (!totp) {
        await navigateAfterAuthSessionReady(dest);
        return;
      }
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (ac.signal.aborted) return;
      if (chErr || !ch?.id) {
        setMessage(chErr?.message ?? "Krok 2FA se nepodařilo zahájit.");
        await supabase.auth.signOut();
        return;
      }
      setMfaFactorId(totp.id);
      setMfaChallengeId(ch.id);
      setMfaCode("");
      setMfaPending(true);
      const q = new URLSearchParams();
      if (nextParam) q.set("next", nextParam);
      if (forceNative) q.set("native", "1");
      if (registerParam) q.set("register", registerParam);
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    })().catch(() => {});
    return () => ac.abort();
  }, [
    pendingMfaParam,
    nextParam,
    forceNative,
    pathname,
    router,
    registerParam,
    navigateAfterAuthSessionReady,
  ]);

  const isClient = role === "client";
  const isInviteFlow = Boolean(clientInviteToken);
  const hasError = Boolean(message);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setMessage("");

      const supabase = createClient();

      if (clientInviteToken) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setIsLoading(false);
          setMessage("Nesprávný e-mail nebo dočasné heslo. Zkontrolujte údaje z pozvánky.");
          return;
        }

        const result = await continueClientInvitationAfterLogin(clientInviteToken);
        setIsLoading(false);
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        if (result.nextStep === "change_password") {
          window.location.href = `/prihlaseni/nastavit-heslo?${buildClientInvitePasswordSetupSearch(clientInviteToken)}`;
          return;
        }
        window.location.href = "/client";
        return;
      }

      if (staffInviteToken) {
        if (isLogin) {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          setIsLoading(false);
          if (error) {
            setMessage(error.message);
            return;
          }
        } else {
          if (!advisorLegalConsent) {
            setIsLoading(false);
            setMessage("Před vytvořením účtu potvrďte souhlas s právními dokumenty níže.");
            return;
          }
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
        }
        window.location.href = buildStaffInviteRegisterCompletePath(staffInviteToken, advisorNextPath);
        return;
      }

      if (role === "client") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setIsLoading(false);
          setMessage(error.message);
          return;
        }
        const access = await ensureClientPortalAccess();
        setIsLoading(false);
        if (!access.ok) {
          setMessage(access.error);
          return;
        }
        if (access.redirectTo) {
          window.location.href = access.redirectTo;
          return;
        }
        window.location.href = clientNextPath;
        return;
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setIsLoading(false);
          setMessage(error.message);
          return;
        }
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
          const { data: fac, error: facErr } = await supabase.auth.mfa.listFactors();
          if (facErr) {
            setIsLoading(false);
            setMessage(facErr.message);
            await supabase.auth.signOut();
            return;
          }
          const totp = fac?.totp?.find((f) => f.status === "verified");
          if (totp) {
            const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
            if (chErr || !ch?.id) {
              setIsLoading(false);
              setMessage(chErr?.message ?? "Krok 2FA se nepodařilo zahájit.");
              await supabase.auth.signOut();
              return;
            }
            setMfaFactorId(totp.id);
            setMfaChallengeId(ch.id);
            setMfaCode("");
            setMfaPending(true);
            setIsLoading(false);
            return;
          }
        }
        setIsLoading(false);
        window.location.href = `/register/complete?next=${encodeURIComponent(advisorNextPath)}`;
      } else {
        if (!advisorLegalConsent) {
          setIsLoading(false);
          setMessage("Před vytvořením účtu potvrďte souhlas s právními dokumenty níže.");
          return;
        }
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
    [
      clientInviteToken,
      staffInviteToken,
      email,
      password,
      advisorLegalConsent,
      role,
      isLogin,
      name,
      clientNextPath,
      advisorNextPath,
    ]
  );

  const cancelMfaAndSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setMfaPending(false);
    setMfaFactorId(null);
    setMfaChallengeId(null);
    setMfaCode("");
    setMessage("");
  }, []);

  const handleMfaVerify = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!mfaFactorId || !mfaChallengeId) return;
      const code = mfaCode.replace(/\s/g, "");
      if (code.length < 6) return;
      setIsLoading(true);
      setMessage("");
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: mfaChallengeId,
        code,
      });
      setIsLoading(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      setMfaPending(false);
      setMfaFactorId(null);
      setMfaChallengeId(null);
      setMfaCode("");
      await navigateAfterAuthSessionReady(advisorNextPath);
    },
    [mfaFactorId, mfaChallengeId, mfaCode, advisorNextPath, navigateAfterAuthSessionReady],
  );

  const handleOAuthSignIn = useCallback(
    async (provider: "google" | "apple") => {
      if (role !== "client" && !isLogin && !clientInviteToken && !staffInviteToken && !advisorLegalConsent) {
        setMessage("Před pokračováním přes Google nebo Apple potvrďte souhlas s právními dokumenty.");
        return;
      }
      const supabase = createClient();
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const nextPath =
        role === "client"
          ? clientNextPath
          : staffInviteToken
            ? buildStaffInviteRegisterCompletePath(staffInviteToken, advisorNextPath)
            : advisorNextPath;
      const encodedNext = encodeURIComponent(nextPath);
      const isNative = forceNative || isNativeRuntime();

      if (isNative) {
        // Native flow: redirect to the bridge route which passes the auth code
        // back to the app via deep link. The code is exchanged CLIENT-SIDE in
        // the WebView (NativeOAuthDeepLinkBridge) so the session ends up in the
        // correct cookie store.
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: `${baseUrl}/auth/native-bridge`,
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

      // Web flow: normal OAuth redirect handled entirely by the browser.
      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${baseUrl}/auth/callback?next=${encodedNext}`,
        },
      });
    },
    [forceNative, role, isLogin, clientInviteToken, staffInviteToken, advisorLegalConsent, clientNextPath, advisorNextPath]
  );

  return {
    forceNative,
    token: clientInviteToken,
    staffInviteToken,
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
    advisorLegalConsent,
    setAdvisorLegalConsent,
    message,
    setMessage,
    isMounted,
    isClient,
    isInviteFlow,
    hasError,
    formRef,
    handleSubmit,
    handleOAuthSignIn,
    mfaPending,
    mfaCode,
    setMfaCode,
    handleMfaVerify,
    cancelMfaAndSignOut,
  };
}

export type AidvisoraLoginState = ReturnType<typeof useAidvisoraLogin>;
