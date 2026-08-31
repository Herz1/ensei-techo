"use client";

import Link from "next/link";
import { Box, ExternalLink, Train, Users, X } from "lucide-react";
import { prefectureById } from "@/data/prefectures";
import type { EventSummary, VenueSummary } from "@/lib/types";
import { todayJst, formatJaDateShort, relativeDayLabel } from "@/lib/time";
import { formatJpy } from "@/lib/currency";
import StatusBadge from "@/components/event/StatusBadge";
import { minPrice, TIER_LABEL } from "@/components/event/status";

export default function VenuePanel({
  venue,
  events,
  onClose,
}: {
  venue: VenueSummary;
  events: EventSummary[];
  onClose: () => void;
}) {
  const pref = prefectureById.get(venue.prefecture);
  const today = todayJst();
  const upcoming = events
    .filter((event) => event.venueId === venue.id)
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <aside className="absolute inset-x-2 bottom-2 z-20 max-h-[58%] overflow-y-auto rounded-2xl border border-zinc-200 bg-white/97 p-4 shadow-2xl backdrop-blur sm:inset-x-auto sm:top-14 sm:right-3 sm:bottom-6 sm:max-h-none sm:w-88 dark:border-zinc-700 dark:bg-zinc-900/97">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {venue.tier ? TIER_LABEL[venue.tier] : "资料待补全"}
          </span>
          <h3 className="mt-1.5 leading-snug font-bold">{venue.nameJa}</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {[venue.nameZh, pref?.nameZh, venue.city].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="关闭场馆面板"
          className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        {venue.capacity !== null && (
          <span className="flex items-center gap-1">
            <Users size={12} /> 约 {venue.capacity.toLocaleString()} 人
          </span>
        )}
        {venue.stations[0] && (
          <span className="flex items-center gap-1">
            <Train size={12} /> {venue.stations[0].station} 徒步{" "}
            {venue.stations[0].walkMin} 分
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Link
          href={`/venues/${venue.id}`}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-zinc-900 py-2 text-xs font-bold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          场地详情 <ExternalLink size={12} />
        </Link>
        {venue.model3d && (
          <Link
            href={`/venues/${venue.id}/3d`}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2 text-xs font-bold text-white"
          >
            <Box size={13} /> 3D 视野
          </Link>
        )}
      </div>

      <p className="mt-4 mb-2 text-xs font-bold text-zinc-500 dark:text-zinc-400">
        未来公演 {upcoming.length} 场
      </p>
      <div className="space-y-2">
        {upcoming.slice(0, 6).map((e) => (
          <Link
            key={e.id}
            href={`/events/${e.id}`}
            prefetch={false}
            className="block rounded-xl border border-zinc-200 p-2.5 transition hover:border-violet-300 dark:border-zinc-700 dark:hover:border-violet-600"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tabular-nums">
                {formatJaDateShort(e.date)}
              </span>
              <span className="text-[10px] font-semibold text-brand-strong dark:text-violet-300">
                {relativeDayLabel(e.date)}
              </span>
              <StatusBadge event={e} className="ml-auto scale-90" />
            </div>
            <p className="mt-1 truncate text-xs font-semibold">{e.titleJa}</p>
            <p className="mt-0.5 text-[11px] text-zinc-400 tabular-nums">
              {minPrice(e) !== null ? `${formatJpy(minPrice(e)!)}〜` : ""}
            </p>
          </Link>
        ))}
        {upcoming.length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-300 py-6 text-center text-xs text-zinc-400 dark:border-zinc-700">
            暂无收录公演
          </p>
        )}
      </div>
    </aside>
  );
}
