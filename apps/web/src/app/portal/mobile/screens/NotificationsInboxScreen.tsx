"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  getConversationsList,
  getUnreadConversationsCount,
  markMessagesRead,
  type ConversationListItem,
} from "@/app/actions/messages";
import { getNotificationBadgeCount, getNotificationLog, type NotificationRow } from "@/app/actions/notification-log";
import {
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingSkeleton,
  MobileSection,
  NotificationListItem,
  SearchBar,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";

type View = "inbox" | "log";

export function NotificationsInboxScreen({
  onBadgeCountChange,
}: {
  onBadgeCountChange?: (count: number) => void;
}) {
  const [view, setView] = useState<View>("inbox");
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [notificationLog, setNotificationLog] = useState<NotificationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      setError(null);
      try {
        const [list, log, unreadConversations, logBadge] = await Promise.all([
          getConversationsList(),
          getNotificationLog(80),
          getUnreadConversationsCount(),
          getNotificationBadgeCount(),
        ]);
        setConversations(list);
        setNotificationLog(log);
        onBadgeCountChange?.(unreadConversations + logBadge);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Inbox se nepodařilo načíst.");
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.trim().toLowerCase();
    return conversations.filter((item) => item.contactName.toLowerCase().includes(q) || item.lastMessage.toLowerCase().includes(q));
  }, [conversations, search]);

  const filteredLog = useMemo(() => {
    if (!search.trim()) return notificationLog;
    const q = search.trim().toLowerCase();
    return notificationLog.filter((item) => `${item.recipient ?? ""} ${item.subject ?? ""} ${item.contactName ?? ""}`.toLowerCase().includes(q));
  }, [notificationLog, search]);

  async function markConversationRead(contactId: string) {
    startTransition(async () => {
      try {
        await markMessagesRead(contactId);
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Konverzaci se nepodařilo označit.");
      }
    });
  }

  return (
    <>
      {error ? <ErrorState title={error} onRetry={load} /> : null}
      {pending && conversations.length === 0 && notificationLog.length === 0 ? <LoadingSkeleton rows={3} /> : null}

      <MobileSection title="Notifications & inbox">
        <FilterChips
          value={view}
          onChange={(id) => setView(id as View)}
          options={[
            { id: "inbox", label: "Inbox", badge: conversations.filter((item) => item.unread).length, tone: conversations.some((item) => item.unread) ? "warning" : "neutral" },
            { id: "log", label: "Log", badge: notificationLog.length },
          ]}
        />
        <SearchBar value={search} onChange={setSearch} placeholder={view === "inbox" ? "Hledat konverzaci..." : "Hledat notifikaci..."} />
      </MobileSection>

      {view === "inbox" ? (
        <MobileSection title="Inbox zpráv od klientů">
          {filteredConversations.length === 0 ? (
            <EmptyState title="Inbox je prázdný" description="Zatím nejsou žádné klientské konverzace." />
          ) : (
            filteredConversations.map((item) => (
              <NotificationListItem
                key={item.contactId}
                title={item.contactName}
                body={item.lastMessage}
                meta={new Date(item.lastMessageAt).toLocaleString("cs-CZ")}
                unread={item.unread}
                action={
                  item.unread ? (
                    <button
                      type="button"
                      onClick={() => markConversationRead(item.contactId)}
                      className="min-h-[32px] rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 px-2 text-[11px] font-bold"
                    >
                      Označit přečtené
                    </button>
                  ) : (
                    <StatusBadge tone="success">read</StatusBadge>
                  )
                }
              />
            ))
          )}
        </MobileSection>
      ) : (
        <MobileSection title="Log odeslaných notifikací">
          {filteredLog.length === 0 ? (
            <EmptyState title="Bez notifikací" description="Historie odeslaných notifikací je prázdná." />
          ) : (
            filteredLog.map((item) => (
              <NotificationListItem
                key={item.id}
                title={item.subject || item.template || "Notifikace"}
                body={`${item.recipient ?? "—"} • ${item.contactName ?? "Bez kontaktu"}`}
                meta={new Date(item.sentAt).toLocaleString("cs-CZ")}
                unread={false}
                action={<StatusBadge tone={item.status === "failed" ? "danger" : item.status === "pending" ? "warning" : "success"}>{item.status}</StatusBadge>}
              />
            ))
          )}
        </MobileSection>
      )}
    </>
  );
}
