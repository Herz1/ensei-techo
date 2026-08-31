"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BellRing, CalendarDays } from "lucide-react";
import type { ArtistSummary, EventSummary, VenueSummary } from "@/lib/types";
import { formatJaDateShort, todayJst } from "@/lib/time";
import ArtistAvatar from "@/components/ui/ArtistAvatar";
import { GENRE_LABEL } from "@/components/event/status";
import SectionTitle from "./SectionTitle";

export default function FollowedArtists({ artists, events, venues }: { artists: ArtistSummary[]; events: EventSummary[]; venues: VenueSummary[] }) {
  const venueById = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues]);
  const nextEventOf = useMemo(() => {
    const today = todayJst();
    const map = new Map<string, EventSummary>();
    // events 按需扫一遍,记录每位关注艺人最近的一场未来公演
    const idSet = new Set(artists.map((a) => a.id));
    const future = events
      .filter((e) => e.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const e of future) {
      for (const aid of e.artistIds) {
        if (idSet.has(aid) && !map.has(aid)) map.set(aid, e);
      }
    }
    return map;
  }, [artists, events]);

  if (artists.length === 0) return null;

  return (
    <section>
      <SectionTitle
        icon={<BellRing size={18} />}
        title="关注的艺人"
        sub={`${artists.length} 位 · 点击进入艺人主页`}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {artists.map((a) => {
          const next = nextEventOf.get(a.id);
          const venue = next ? venueById.get(next.venueId) : undefined;
          return (
            <Link
              key={a.id}
              href={`/artists/${a.id}`}
              className="group rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-violet-300 hover:shadow-md hover:shadow-violet-500/5 dark:border-zinc-800 dark:bg-card-dark dark:hover:border-violet-700"
            >
              <div className="flex items-center gap-3">
                <ArtistAvatar artist={a} size={44} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold group-hover:text-brand-strong dark:group-hover:text-violet-300">
                    {a.nameJa}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-400">
                    {GENRE_LABEL[a.genres[0]] ?? a.romaji}
                  </p>
                </div>
              </div>
              <p className="mt-3 flex items-center gap-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                <CalendarDays size={11} className="shrink-0" />
                {next ? (
                  <>
                    <span className="font-semibold tabular-nums">
                      {formatJaDateShort(next.date)}
                    </span>
                    <span className="truncate">{venue?.nameZh ?? venue?.nameJa}</span>
                  </>
                ) : (
                  "暂无收录的未来公演"
                )}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
