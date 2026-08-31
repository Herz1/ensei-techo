import type { EventItem, EventStatus } from "@/lib/types";
import { STATUS_META } from "./status";

export default function StatusBadge({
  status,
  event,
  showZh = false,
  className = "",
}: {
  status?: EventStatus;
  event?: Pick<EventItem, "eventStatus" | "status">;
  showZh?: boolean;
  className?: string;
}) {
  const lifecycle = event?.eventStatus;
  const lifecycleMeta = lifecycle === "cancelled"
    ? { label: "公演中止", zh: "已取消", cls: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300", dot: "bg-red-500" }
    : lifecycle === "postponed"
      ? { label: "延期", zh: "已延期", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", dot: "bg-amber-500" }
      : lifecycle === "rescheduled"
        ? { label: "日程変更", zh: "日期变更", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", dot: "bg-amber-500" }
        : null;
  const resolvedStatus = status ?? event?.status ?? "announced";
  const meta = lifecycleMeta ?? STATUS_META[resolvedStatus];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${meta.cls} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${resolvedStatus === "lottery" || resolvedStatus === "on_sale" ? "animate-pulse" : ""}`} />
      {meta.label}
      {showZh && <span className="font-normal opacity-70">{meta.zh}</span>}
    </span>
  );
}
