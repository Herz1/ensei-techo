import { Suspense } from "react";
import EventsBrowser from "@/components/event/EventsBrowser";
import {
  artistSummaries,
  eventSummaries,
  venueSummaries,
} from "@/data/client-data";

export const metadata = { title: "公演" };

export default function EventsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <h1 className="sr-only">公演</h1>
      <p className="mb-3 hidden text-xl font-bold md:block">
        公演 <span className="ml-2 text-xs font-normal text-zinc-400">列表 · 日历 · 地图</span>
      </p>
      <Suspense>
        <EventsBrowser events={eventSummaries} artists={artistSummaries} venues={venueSummaries} />
      </Suspense>
    </div>
  );
}
