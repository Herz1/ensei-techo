"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Flame, MapPin } from "lucide-react";
import { prefectureById } from "@/data/prefectures";
import type { ArtistSummary, EventSummary, VenueSummary } from "@/lib/types";
import { artistHeat, prefectureHeat, topEvents } from "@/lib/heat";
import { formatJaDateShort } from "@/lib/time";
import ArtistAvatar from "@/components/ui/ArtistAvatar";
import StatusBadge from "@/components/event/StatusBadge";
import { GENRE_LABEL } from "@/components/event/status";

type TabKey = "artists" | "events" | "regions";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "artists", label: "艺人收录", icon: <Flame size={14} /> },
  { key: "events", label: "近期演出", icon: <CalendarDays size={14} /> },
  { key: "regions", label: "地区收录", icon: <MapPin size={14} /> },
];

function RankNo({ n }: { n: number }) {
  return (
    <span
      className={`w-8 shrink-0 text-center text-lg font-black tabular-nums ${
        n === 1
          ? "text-amber-500"
          : n === 2
            ? "text-zinc-400"
            : n === 3
              ? "text-orange-400"
              : "text-zinc-300 dark:text-zinc-600"
      }`}
    >
      {n}
    </span>
  );
}

export default function RankingsTabs({ events, artists, venues }: { events: EventSummary[]; artists: ArtistSummary[]; venues: VenueSummary[] }) {
  const [tab, setTab] = useState<TabKey>("artists");
  const venueById = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues]);

  const artistRank = useMemo(
    () =>
      artists
        .map((a) => ({ a, count: artistHeat(a, events) }))
        .filter((item) => item.count > 0)
        .sort((x, y) => y.count - x.count)
        .slice(0, 20),
    [artists, events],
  );

  const eventRank = useMemo(() => topEvents(events, 20), [events]);

  const regionRank = useMemo(() => {
    const heat = prefectureHeat(events, venues);
    const max = Math.max(1, ...[...heat.values()].map((h) => h.heat));
    return [...heat.entries()]
      .map(([prefId, h]) => ({
        pref: prefectureById.get(prefId),
        ...h,
        ratio: h.heat / max,
      }))
      .filter((x) => x.pref)
      .sort((x, y) => y.heat - x.heat);
  }, [events, venues]);

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === t.key
                ? "bg-brand text-white shadow-md shadow-violet-500/25"
                : "bg-white text-zinc-500 hover:text-zinc-900 dark:bg-card-dark dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "artists" && (
          <ol className="space-y-2">
            {artistRank.map(({ a, count }, i) => (
              <li key={a.id}>
                <Link
                  href={`/artists/${a.id}`}
                  className="group flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 transition hover:border-violet-300 dark:border-zinc-800 dark:bg-card-dark dark:hover:border-violet-700"
                >
                  <RankNo n={i + 1} />
                  <ArtistAvatar artist={a} size={42} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold group-hover:text-brand-strong dark:group-hover:text-violet-300">
                      {a.nameJa}
                      <span className="ml-2 text-xs font-normal text-zinc-400">
                        {a.nameZh !== a.nameJa ? a.nameZh : a.romaji}
                      </span>
                    </p>
                    <p className="mt-0.5 flex gap-1">
                      {a.genres.slice(0, 2).map((g) => (
                        <span
                          key={g}
                          className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        >
                          {GENRE_LABEL[g]}
                        </span>
                      ))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums">{count} 场</p>
                    <p className="text-[10px] text-zinc-400">已核验未来公演</p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}

        {tab === "events" && (
          <ol className="space-y-2">
            {eventRank.map(({ event: e }, i) => {
              const venue = venueById.get(e.venueId);
              return (
                <li key={e.id}>
                  <Link
                    href={`/events/${e.id}`}
                    prefetch={false}
                    className="group flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 transition hover:border-violet-300 dark:border-zinc-800 dark:bg-card-dark dark:hover:border-violet-700"
                  >
                    <RankNo n={i + 1} />
                    <span className="w-14 shrink-0 text-sm font-bold tabular-nums">
                      {formatJaDateShort(e.date)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold group-hover:text-brand-strong dark:group-hover:text-violet-300">
                        {e.titleJa}
                      </p>
                      <p className="truncate text-[11px] text-zinc-400">
                        {venue?.nameJa}
                      </p>
                    </div>
                    <StatusBadge event={e} className="hidden sm:inline-flex" />
                    <div className="text-right">
                      <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        官方来源
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}

        {tab === "regions" && (
          <ol className="space-y-2">
            {regionRank.map(({ pref, count, ratio }, i) => (
              <li key={pref!.id}>
                <Link
                  href={`/events?pref=${pref!.id}`}
                  className="group block rounded-2xl border border-zinc-200 bg-white p-3.5 transition hover:border-violet-300 dark:border-zinc-800 dark:bg-card-dark dark:hover:border-violet-700"
                >
                  <div className="flex items-center gap-3">
                    <RankNo n={i + 1} />
                    <p className="flex-1 font-semibold group-hover:text-brand-strong dark:group-hover:text-violet-300">
                      {pref!.nameZh}
                      <span className="ml-2 text-xs font-normal text-zinc-400">
                        {pref!.nameJa}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-400">{count} 场未来公演</p>
                    <p className="w-16 text-right font-bold tabular-nums">{count} 场</p>
                  </div>
                  <div className="mt-2 ml-11 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                      style={{ width: `${Math.max(3, ratio * 100)}%` }}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}

      </div>

      <p className="mt-6 text-center text-[11px] text-zinc-400">
        排名仅按当前已核验的未来公演数量统计，不代表艺人实际人气或售票表现。
      </p>
    </div>
  );
}
