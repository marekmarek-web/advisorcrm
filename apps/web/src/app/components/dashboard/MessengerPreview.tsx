"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getRecentConversations, type RecentConversation } from "@/app/actions/messages";

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMin = Math.round((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "teď";
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} d`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ["#579bfc", "#a25ddc", "#00c875", "#fdab3d", "#ff642e", "#485fed", "#e5534b"];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function MessengerPreview() {
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getRecentConversations(5)
      .then(setConversations)
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="pt-6 border-t border-slate-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Zprávy z portálu</h3>
        {!loading && conversations.length > 0 && conversations.some((c) => c.unread) && (
          <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 text-[10px] font-black flex items-center justify-center">
            {conversations.filter((c) => c.unread).length}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Načítám…</p>
      ) : conversations.length === 0 ? (
        <p className="text-sm text-slate-500">Žádné nedávné zprávy.</p>
      ) : (
        <div className="space-y-3">
          {conversations.map((c) => (
            <Link
              key={c.contactId}
              href={`/portal/contacts/${c.contactId}?tab=chat`}
              className="p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-white hover:shadow-sm transition-all cursor-pointer flex gap-4 text-inherit no-underline"
            >
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0"
                style={{ background: avatarColor(c.contactName) }}
              >
                {getInitials(c.contactName)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <h4 className={`text-sm truncate pr-2 ${c.unread ? "font-black text-slate-900" : "font-bold text-slate-700"}`}>
                    {c.contactName}
                  </h4>
                  <span className="text-[10px] font-bold text-slate-400 flex-shrink-0">{timeAgo(c.lastMessageAt)}</span>
                </div>
                <p className={`text-xs truncate ${c.unread ? "font-bold text-slate-800" : "text-slate-500"}`}>
                  {c.senderType === "advisor" ? "Vy: " : ""}{c.lastMessage}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Link
        href="/portal/contacts"
        className="inline-block mt-3 text-xs font-semibold text-indigo-600 hover:underline"
      >
        Otevřít chat →
      </Link>
    </div>
  );
}
