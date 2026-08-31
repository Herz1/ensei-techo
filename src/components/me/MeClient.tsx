"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Compass, Flame } from "lucide-react";
import type { ArtistSummary, EventSummary, VenueSummary } from "@/lib/types";
import { useEventPlans, useFollows, usePreferences } from "@/lib/store";
import { useTripPlans } from "@/lib/trip-store";
import { todayJst } from "@/lib/time";
import WantTimeline from "./WantTimeline";
import FollowedArtists from "./FollowedArtists";
import DataManage from "./DataManage";
import PreferencesPanel from "./PreferencesPanel";

function EmptyState() {
  return (
    <section className="rounded-3xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700">
      <Compass size={40} strokeWidth={1.2} className="mx-auto text-zinc-300 dark:text-zinc-600" />
      <h2 className="mt-4 text-lg font-bold">这里还是一片空白</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-zinc-400">
        在演出列表把 Live 加入计划、在艺人页点关注，这里会保留申请历史、
        关注与本机设置。
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <Link
          href="/events"
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong"
        >
          浏览演出 <ArrowRight size={14} />
        </Link>
        <Link
          href="/rankings"
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-violet-400 hover:text-brand-strong dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-violet-500 dark:hover:text-violet-300"
        >
          <Flame size={14} /> 看看热力榜
        </Link>
      </div>
    </section>
  );
}

export default function MeClient({ events, artists, venues }: { events: EventSummary[]; artists: ArtistSummary[]; venues: VenueSummary[] }) {
  const { plans } = useEventPlans();
  const { items: followIds } = useFollows();
  const { preferences } = usePreferences();
  const { trips } = useTripPlans();
  const today = todayJst();
  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const artistById = useMemo(() => new Map(artists.map((artist) => [artist.id, artist])), [artists]);

  const validPlans = useMemo(
    () => plans.filter((plan) => eventById.has(plan.eventId)),
    [eventById, plans],
  );
  const plannedEvents = useMemo(
    () => validPlans
      .map((plan) => eventById.get(plan.eventId))
      .filter((event): event is EventSummary => Boolean(event))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [eventById, validPlans],
  );
  const upcoming = useMemo(
    () => plannedEvents.filter((event) => event.date >= today),
    [plannedEvents, today],
  );
  const followed = useMemo(
    () =>
      followIds
        .map((id) => artistById.get(id))
        .filter((a): a is ArtistSummary => Boolean(a)),
    [artistById, followIds],
  );

  const empty = validPlans.length === 0 && followed.length === 0;

  return (
    <div className="space-y-9 pb-6">
      {empty ? (
        <EmptyState />
      ) : (
        <>
          <WantTimeline plans={validPlans} events={events} artists={artists} venues={venues} />
          <FollowedArtists artists={followed} events={events} venues={venues} />
        </>
      )}
      <PreferencesPanel key={preferences.updatedAt} />
      <DataManage plans={validPlans} followIds={followIds} upcoming={upcoming} trips={trips} events={events} artists={artists} venues={venues} />
    </div>
  );
}
