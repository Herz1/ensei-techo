import Link from "next/link";
import { MapPin, Radio } from "lucide-react";
import type { ArtistSummary, EventSummary, VenueSummary } from "@/lib/types";
import { prefectureById } from "@/data/prefectures";
import { formatJaDateShort, relativeDayLabel } from "@/lib/time";
import PreferencePrice from "@/components/ui/PreferencePrice";
import StatusBadge from "./StatusBadge";
import WantButton from "./WantButton";
import { minPrice, TYPE_LABEL } from "./status";

/** 列表行 */
export default function EventRow({
  event,
  artists,
  venue,
}: {
  event: EventSummary;
  artists: ArtistSummary[];
  venue?: VenueSummary;
}) {
  const pref = venue ? prefectureById.get(venue.prefecture) : undefined;
  const price = minPrice(event);
  const rel = relativeDayLabel(event.date);
  const ended = event.status === "ended";

  return (
    <article
      className={`group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-3.5 transition hover:border-violet-300 hover:shadow-md hover:shadow-violet-500/5 sm:p-4 dark:border-zinc-800 dark:bg-card-dark dark:hover:border-violet-700 ${ended ? "opacity-60" : ""}`}
    >
      <Link
        href={`/events/${event.id}`}
        prefetch={false}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg sm:gap-4"
      >
        <div className="w-16 shrink-0 text-center sm:w-20">
          <p className="text-base font-bold tabular-nums sm:text-lg">
            {formatJaDateShort(event.date)}
          </p>
          <p className="text-xs font-semibold text-brand-strong dark:text-violet-300">
            {rel}
          </p>
          <p className="text-xs text-zinc-400">{event.startTime} 開演</p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge event={event} />
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {TYPE_LABEL[event.type]}
            </span>
            {event.streaming && (
              <span className="flex items-center gap-0.5 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-600 dark:bg-sky-500/20 dark:text-sky-300">
                <Radio size={12} /> 配信
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-semibold group-hover:text-brand-strong sm:text-[15px] dark:group-hover:text-violet-300">
            {event.titleJa}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
            <span className="truncate">
              {artists.map((a) => a.nameJa).slice(0, 3).join(" / ")}
            </span>
            <span className="mx-1 text-zinc-300 dark:text-zinc-700">|</span>
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{venue?.nameJa}</span>
            {pref && <span className="shrink-0">· {pref.nameZh}</span>}
          </p>
        </div>

        <div className="hidden shrink-0 text-right sm:block">
          {price !== null ? (
            <PreferencePrice
              amountJpy={price}
              suffix="〜"
              className="text-sm font-bold tabular-nums"
              referenceClassName="mt-1 text-xs font-normal text-zinc-400"
            />
          ) : <p className="text-sm font-bold">未定</p>}
          <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            演出官方来源
          </p>
        </div>
      </Link>

      <WantButton eventId={event.id} />
    </article>
  );
}
