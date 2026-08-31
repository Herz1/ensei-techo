"use client";

import Link from "next/link";
import { ArrowRight, Luggage, Route } from "lucide-react";
import { buildTripTimeline } from "@/lib/trip";
import { useTripPlans } from "@/lib/trip-store";
import { formatJaDate, todayJst } from "@/lib/time";
import type { EventSummary, VenueSummary } from "@/lib/types";
import SectionTitle from "@/components/me/SectionTitle";

export default function UpcomingTrips({ events, venues }: { events: EventSummary[]; venues: VenueSummary[] }) {
  const { trips } = useTripPlans();
  const catalog = {
    eventById: new Map(events.map((event) => [event.id, event])),
    venueById: new Map(venues.map((venue) => [venue.id, venue])),
  };
  const today = todayJst();
  const upcoming = trips
    .filter((trip) => trip.endDate >= today)
    .sort((left, right) => left.startDate.localeCompare(right.startDate))
    .slice(0, 3);

  if (!upcoming.length) return null;

  return (
    <section>
      <SectionTitle
        icon={<Luggage size={18} />}
        title="即将出发的远征"
        sub="中签后的交通、住宿与入场准备"
        right={<Link href="/trips" prefetch={false} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-brand-strong">全部远征 <ArrowRight size={13} /></Link>}
      />
      <div className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-card-dark">
        {upcoming.map((trip) => {
          const timeline = buildTripTimeline(trip, catalog);
          const next = timeline.find((item) => item.date >= today) ?? timeline[0];
          return (
            <Link key={trip.id} href={`/trips/${trip.id}`} prefetch={false} className="group flex min-h-20 items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300"><Route size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold group-hover:text-brand-strong">{trip.name}</span>
                <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {next ? `${next.title} · ${next.time ?? "时间待确认"}` : "尚未添加行程事项"}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs font-semibold text-zinc-500">
                {formatJaDate(trip.startDate)}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
