"use client";

import dynamic from "next/dynamic";
import type { EventSummary, VenueSummary } from "@/lib/types";

const JapanMap = dynamic(() => import("./JapanMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-zinc-400">
      地图初始化中…
    </div>
  ),
});

export default function MapClient({
  eventIds,
  events,
  venues,
}: {
  eventIds?: string[];
  events: EventSummary[];
  venues: VenueSummary[];
}) {
  return <JapanMap eventIds={eventIds} events={events} venues={venues} />;
}
