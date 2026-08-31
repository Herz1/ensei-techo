"use client";

import { useEffect, useState } from "react";
import { countdownLabel } from "@/lib/time";

/** 客户端倒计时标签(每分钟刷新),endDate 为 JST 日期 */
export default function CountdownChip({
  endDate,
  prefix = "",
  className = "",
}: {
  endDate: string;
  prefix?: string;
  className?: string;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLabel(countdownLabel(endDate));
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [endDate]);

  if (!label) return null;
  const urgent = label.includes("今天") || label.includes("明天");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        urgent
          ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      } ${className}`}
    >
      {prefix}
      {label}
    </span>
  );
}
