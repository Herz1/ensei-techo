"use client";

import { useSyncExternalStore } from "react";
import { usePreferences } from "@/lib/store";
import { isUserInJst, toLocalTime, toTimeZoneTime } from "@/lib/time";

const subscribe = () => () => {};

/** 非日本时区用户显示本地换算时刻 */
export default function LocalTime({
  date,
  time,
  label = "你的时区",
}: {
  date: string;
  time: string;
  label?: string;
}) {
  const { preferences } = usePreferences();
  const text = useSyncExternalStore(
    subscribe,
    () => {
      if (preferences.timeZone === "Asia/Tokyo") return null;
      if (preferences.timeZone === "browser") {
        return isUserInJst() ? null : toLocalTime(date, time);
      }
      return toTimeZoneTime(date, time, preferences.timeZone);
    },
    () => null,
  );

  if (!text) return null;
  return (
    <span className="text-xs text-zinc-400 dark:text-zinc-500">
      {label} {text}
    </span>
  );
}
