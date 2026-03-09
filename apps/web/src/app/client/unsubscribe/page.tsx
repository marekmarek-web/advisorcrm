"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { unsubscribeFromNotifications } from "@/app/actions/unsubscribe";
import { unsubscribeByToken } from "@/app/actions/unsubscribe";

export default function UnsubscribePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    if (token) {
      unsubscribeByToken(token)
        .then((r) => {
          setStatus(r.ok ? "done" : "error");
          if (r.ok) setTimeout(() => router.push("/"), 2000);
        })
        .catch(() => setStatus("error"));
    } else {
      unsubscribeFromNotifications()
        .then((r) => {
          setStatus(r.ok ? "done" : "error");
          if (r.ok) setTimeout(() => router.push("/client"), 2000);
        })
        .catch(() => setStatus("error"));
    }
  }, [router, token]);

  return (
    <div className="max-w-md mx-auto p-6 text-center">
      {status === "loading" && <p className="text-monday-text-muted">Odhlašuji…</p>}
      {status === "done" && (
        <p className="text-monday-text">
          Odhlášení z notifikací proběhlo. Za chvíli vás přesměrujeme do Client Zone.
        </p>
      )}
      {status === "error" && (
        <p className="text-red-600">Nepodařilo se odhlásit. Jste přihlášeni jako klient?</p>
      )}
    </div>
  );
}
