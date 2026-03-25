"use client";

import { useState, useCallback } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Shield,
  Zap,
} from "lucide-react";
import {
  EmptyState,
  FilterChips,
  MobileCard,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";

type ActionCenterItemType =
  | "approval_pending" | "reminder_due" | "blocked_item"
  | "draft_awaiting" | "review_waiting" | "escalation";

type QuickAction = {
  actionType: string;
  label: string;
  requiresConfirmation: boolean;
};

type ActionCenterItem = {
  id: string;
  type: ActionCenterItemType;
  title: string;
  description: string;
  severity: "info" | "warning" | "urgent";
  entityType: string;
  entityId: string;
  quickActions: QuickAction[];
  deepLink: string;
  createdAt: string;
};

type FilterType = "all" | "urgent" | "reminders" | "reviews" | "escalations";

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "Vše" },
  { value: "urgent", label: "Urgentní" },
  { value: "reminders", label: "Připomínky" },
  { value: "reviews", label: "Review" },
  { value: "escalations", label: "Eskalace" },
];

function getIcon(type: ActionCenterItemType) {
  switch (type) {
    case "approval_pending": return <FileText className="w-5 h-5 text-amber-500" />;
    case "reminder_due": return <Clock className="w-5 h-5 text-blue-500" />;
    case "blocked_item": return <AlertTriangle className="w-5 h-5 text-red-500" />;
    case "draft_awaiting": return <FileText className="w-5 h-5 text-purple-500" />;
    case "review_waiting": return <Shield className="w-5 h-5 text-orange-500" />;
    case "escalation": return <Zap className="w-5 h-5 text-red-600" />;
  }
}

function getSeverityVariant(severity: string): "success" | "warning" | "danger" | "neutral" {
  switch (severity) {
    case "urgent": return "danger";
    case "warning": return "warning";
    default: return "neutral";
  }
}

export function ActionCenterScreen({
  initialItems = [],
  onNavigate,
  onRefresh,
}: {
  initialItems?: ActionCenterItem[];
  onNavigate?: (path: string) => void;
  onRefresh?: () => Promise<ActionCenterItem[]>;
}) {
  const [items, setItems] = useState<ActionCenterItem[]>(initialItems);
  const [filter, setFilter] = useState<FilterType>("all");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      const newItems = await onRefresh();
      setItems(newItems);
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const filtered = items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "urgent") return item.severity === "urgent";
    if (filter === "reminders") return item.type === "reminder_due";
    if (filter === "reviews") return item.type === "review_waiting" || item.type === "blocked_item";
    if (filter === "escalations") return item.type === "escalation";
    return true;
  });

  const urgentCount = items.filter((i) => i.severity === "urgent").length;

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Akční centrum</h1>
            {urgentCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                {urgentCount}
              </span>
            )}
          </div>
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-sm text-blue-600 dark:text-blue-400 font-medium disabled:opacity-50"
            >
              {refreshing ? "Načítání..." : "Obnovit"}
            </button>
          )}
        </div>

        <FilterChips
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(v) => setFilter(v as FilterType)}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-10 h-10 text-green-500" />}
            title="Vše vyřízeno"
            description="Nemáte žádné čekající akce."
          />
        ) : (
          filtered.map((item) => (
            <MobileCard
              key={item.id}
              onClick={() => onNavigate?.(item.deepLink)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getIcon(item.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {item.title}
                    </span>
                    <StatusBadge variant={getSeverityVariant(item.severity)}>
                      {item.severity === "urgent" ? "Urgentní" : item.severity === "warning" ? "Varování" : "Info"}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {item.description}
                  </p>
                  {item.quickActions.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {item.quickActions.map((qa) => (
                        <button
                          key={qa.actionType}
                          className="text-xs px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          {qa.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
              </div>
            </MobileCard>
          ))
        )}
      </div>
    </div>
  );
}
