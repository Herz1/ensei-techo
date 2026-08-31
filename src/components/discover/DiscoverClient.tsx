"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Compass,
  MapPin,
  Users,
} from "lucide-react";
import { prefectureById } from "@/data/prefectures";
import type { ArtistSummary, EventSummary, VenueSummary } from "@/lib/types";
import { todayJst } from "@/lib/time";
import { useEventPlans, useFollows, usePreferences } from "@/lib/store";
import { minPrice } from "@/components/event/status";
import EventCard from "@/components/event/EventCard";
import SaleAlerts from "@/components/me/SaleAlerts";
import SectionTitle from "@/components/me/SectionTitle";
import FirstRunSetup from "./FirstRunSetup";
import UpcomingTrips from "./UpcomingTrips";
import SocialLeadInbox from "./SocialLeadInbox";

const MAX_CARDS = 10;

function CardStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex snap-x gap-3 overflow-x-auto pb-2 scrollbar-hide">
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400 dark:border-zinc-700">
      {children}
    </p>
  );
}

export default function DiscoverClient({
  events,
  artists,
  venues,
}: {
  events: EventSummary[];
  artists: ArtistSummary[];
  venues: VenueSummary[];
}) {
  const today = todayJst();
  const artistById = useMemo(
    () => new Map(artists.map((artist) => [artist.id, artist])),
    [artists],
  );
  const venueById = useMemo(
    () => new Map(venues.map((venue) => [venue.id, venue])),
    [venues],
  );
  const { items: followedIds } = useFollows();
  const { plans } = useEventPlans();
  const { preferences } = usePreferences();

  const followed = useMemo(
    () => followedIds
      .map((id) => artistById.get(id))
      .filter((artist): artist is NonNullable<typeof artist> => Boolean(artist)),
    [artistById, followedIds],
  );
  const followedSet = useMemo(() => new Set(followedIds), [followedIds]);
  const planSet = useMemo(
    () => new Set(plans.map((plan) => plan.eventId)),
    [plans],
  );
  const followedEvents = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.date >= today &&
            event.artistIds.some((artistId) => followedSet.has(artistId)),
        )
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(0, MAX_CARDS),
    [events, followedSet, today],
  );

  const nearbyEvents = useMemo(() => {
    if (!preferences.homePrefecture) return [];
    return events
      .filter(
        (event) =>
          event.date >= today &&
          venueById.get(event.venueId)?.prefecture === preferences.homePrefecture,
      )
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(0, MAX_CARDS);
  }, [events, preferences.homePrefecture, today, venueById]);

  const recommendations = useMemo(() => {
    const followedGenres = new Set(
      followed.flatMap((artist) => artist.genres),
    );
    const coPerformerIds = new Set<string>();
    for (const event of events) {
      if (event.artistIds.some((artistId) => followedSet.has(artistId))) {
        event.artistIds.forEach((artistId) => {
          if (!followedSet.has(artistId)) coPerformerIds.add(artistId);
        });
      }
    }
    const plannedDates = plans
      .map((plan) => events.find((event) => event.id === plan.eventId)?.date)
      .filter((date): date is string => Boolean(date));

    return events
      .filter((event) => event.date >= today && !planSet.has(event.id))
      .map((event) => {
        const reasons: string[] = [];
        const eventArtists = event.artistIds
          .map((artistId) => artistById.get(artistId))
          .filter((artist): artist is NonNullable<typeof artist> => Boolean(artist));
        if (event.artistIds.some((artistId) => followedSet.has(artistId))) {
          reasons.push("关注艺人");
        }
        if (
          followedGenres.size > 0 &&
          eventArtists.some((artist) =>
            artist.genres.some((genre) => followedGenres.has(genre)),
          )
        ) {
          reasons.push("相同 Genre");
        }
        if (event.artistIds.some((artistId) => coPerformerIds.has(artistId))) {
          reasons.push("同场出演者");
        }
        if (
          preferences.homePrefecture &&
          venueById.get(event.venueId)?.prefecture === preferences.homePrefecture
        ) {
          reasons.push("常驻地区");
        }
        if (
          plannedDates.some(
            (date) =>
              Math.abs(
                (Date.parse(`${event.date}T12:00:00+09:00`) -
                  Date.parse(`${date}T12:00:00+09:00`)) /
                  86_400_000,
              ) <= 3,
          )
        ) {
          reasons.push("计划日期附近");
        }
        if (reasons.length === 0 && followedIds.length === 0 && plans.length === 0) {
          reasons.push("近期公演");
        }
        return { event, reasons, price: minPrice(event) };
      })
      .filter((item) => item.reasons.length > 0)
      .sort((left, right) => {
        if (left.reasons.length !== right.reasons.length) {
          return right.reasons.length - left.reasons.length;
        }
        return left.event.date.localeCompare(right.event.date);
      })
      .slice(0, 12);
  }, [artistById, events, followed, followedIds, followedSet, planSet, plans, preferences.homePrefecture, today, venueById]);

  const nearbyName = preferences.homePrefecture
    ? prefectureById.get(preferences.homePrefecture)?.nameZh
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-9 px-4 py-4 sm:py-6">
      <header className="border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-violet-600 dark:text-violet-300">今日 / TODAY</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">先完成眼前的动作</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            先看截止、结果和付款，再安排远征与下一场公演。
          </p>
        </div>
      </header>

      {preferences.setupStatus === "pending" && (
        <FirstRunSetup key={preferences.updatedAt} artists={artists} />
      )}

      <SaleAlerts plans={plans} followed={followed} events={events} compact />

      <SocialLeadInbox events={events} artists={artists} venues={venues} />

      <UpcomingTrips events={events} venues={venues} />

      <section>
        <SectionTitle
          icon={<Users size={18} />}
          title="关注艺人的近期公演"
          sub="你的关注优先于通用发现"
          right={
            <Link href="/events?followed=1" prefetch={false} className="text-xs font-semibold text-zinc-500 hover:text-brand-strong">
              查看全部
            </Link>
          }
        />
        {followedEvents.length ? (
          <CardStrip>
            {followedEvents.map((event) => <EventCard key={event.id} event={event} artists={event.artistIds.map((id) => artistById.get(id)).filter((artist): artist is ArtistSummary => Boolean(artist))} venue={venueById.get(event.venueId)} />)}
          </CardStrip>
        ) : (
          <Empty>{followed.length ? "关注艺人暂无近期公演" : "尚未关注艺人，可在上方设置或艺人页关注"}</Empty>
        )}
      </section>

      <section>
        <SectionTitle
          icon={<MapPin size={18} />}
          title={nearbyName ? `${nearbyName}附近的公演` : "用户设定地区附近的公演"}
          sub={nearbyName ? "按常驻都道府县筛选" : "设置常驻都道府县后显示"}
          right={nearbyName ? <Link href={`/events?pref=${preferences.homePrefecture}`} className="text-xs font-semibold text-zinc-500 hover:text-brand-strong">查看全部</Link> : undefined}
        />
        {nearbyEvents.length ? (
          <CardStrip>
            {nearbyEvents.map((event) => <EventCard key={event.id} event={event} artists={event.artistIds.map((id) => artistById.get(id)).filter((artist): artist is ArtistSummary => Boolean(artist))} venue={venueById.get(event.venueId)} />)}
          </CardStrip>
        ) : (
          <Empty>{nearbyName ? "该地区暂无近期收录公演" : "点击上方“个性设置”选择常驻都道府县"}</Empty>
        )}
      </section>

      <section>
        <SectionTitle
          icon={<Compass size={18} />}
          title="通用发现"
          sub="关注、Genre、同场出演、地区和计划日期等可解释规则"
          right={<Link href="/events" prefetch={false} className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-brand-strong">全部公演 <ArrowRight size={12} /></Link>}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recommendations.map(({ event, reasons }) => {
            const venue = venueById.get(event.venueId);
            return (
              <Link key={event.id} href={`/events/${event.id}`} prefetch={false} className="group rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-violet-300 dark:border-zinc-800 dark:bg-card-dark dark:hover:border-violet-700">
                <div className="flex flex-wrap gap-1">
                  {reasons.slice(0, 3).map((reason) => <span key={reason} className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">因为：{reason}</span>)}
                </div>
                <p className="mt-3 line-clamp-2 text-sm font-bold group-hover:text-brand-strong">{event.titleJa}</p>
                <p className="mt-2 text-xs text-zinc-400">{event.date.replaceAll("-", "/")} · {venue?.nameJa ?? "场馆待确认"}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <Link href="/rankings" className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 text-sm transition hover:border-violet-300 dark:border-zinc-800 dark:bg-card-dark">
        <span className="inline-flex items-center gap-2 font-semibold"><BarChart3 size={16} className="text-violet-500" /> 站内收录动态</span>
        <span className="text-xs text-zinc-400">{artists.length} 位艺人 · {events.length} 场公演 <ArrowRight size={12} className="ml-1 inline" /></span>
      </Link>
    </div>
  );
}
