"use client";

import { useSyncExternalStore } from "react";
import { usePreferences } from "@/lib/store";

const subscribe = () => () => {};

function formatAt(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatJstInstant(value: string | null): string {
  return value ? formatAt(value, "Asia/Tokyo") : "未说明";
}

export default function OfficialInstant({
  value,
  emptyLabel = "未说明",
  className = "",
  localClassName = "",
}: {
  value: string | null;
  emptyLabel?: string;
  className?: string;
  localClassName?: string;
}) {
  const { preferences } = usePreferences();
  const local = useSyncExternalStore(
    subscribe,
    () => {
      if (!value || preferences.timeZone === "Asia/Tokyo") return null;
      const timeZone = preferences.timeZone === "browser"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : preferences.timeZone;
      if (!timeZone || timeZone === "Asia/Tokyo") return null;
      return `${formatAt(value, timeZone)} · ${timeZone}`;
    },
    () => null,
  );

  return (
    <span className="inline-flex flex-col leading-tight">
      <span className={className}>{value ? `${formatJstInstant(value)} JST` : emptyLabel}</span>
      {local && (
        <span className={localClassName || "mt-1 text-xs font-normal text-zinc-400"}>
          本地 {local}
        </span>
      )}
    </span>
  );
}
