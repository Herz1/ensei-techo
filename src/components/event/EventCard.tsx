import Link from "next/link";
import { MapPin } from "lucide-react";
import type { ArtistSummary, EventSummary, VenueSummary } from "@/lib/types";
import { prefectureById } from "@/data/prefectures";
import { formatJaDateShort, relativeDayLabel } from "@/lib/time";
import PreferencePrice from "@/components/ui/PreferencePrice";
import StatusBadge from "./StatusBadge";
import { minPrice } from "./status";
import { actionableTicketOffersOf, ticketOffersOf, ticketUrlKindLabel } from "@/lib/ticket-offer";

/** 横向流卡片 */
export default function EventCard({
  event,
  artists,
  venue,
  showSaleStart = false,
}: {
  event: EventSummary;
  artists: ArtistSummary[];
  venue?: VenueSummary;
  showSaleStart?: boolean;
}) {
  const pref = venue ? prefectureById.get(venue.prefecture) : undefined;
  const price = minPrice(event);
  const rel = relativeDayLabel(event.date);
  const ticketEntry = ticketOffersOf(event).find((offer) => !["support", "refund"].includes(offer.urlKind));
  const nextOffer = showSaleStart
    ? actionableTicketOffersOf(event)
        .filter((offer) => offer.saleStatus === "not_started" && offer.startAt)
        .sort((left, right) => String(left.startAt).localeCompare(String(right.startAt)))[0]
    : undefined;

  return (
    <Link
      href={`/events/${event.id}`}
      prefetch={false}
      className="group flex w-64 shrink-0 snap-start flex-col rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-violet-300 dark:border-zinc-800 dark:bg-card-dark dark:hover:border-violet-700"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-lg font-bold tabular-nums">
            {formatJaDateShort(event.date)}
          </span>
          {rel && (
            <span className="ml-2 text-xs font-semibold text-brand-strong dark:text-violet-300">
              {rel}
            </span>
          )}
        </div>
        <StatusBadge event={event} />
      </div>

      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 font-semibold group-hover:text-brand-strong dark:group-hover:text-violet-300">
        {event.titleJa}
      </p>
      <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
        {artists.map((a) => a.nameJa).slice(0, 3).join(" / ")}
      </p>

      <div className="mt-auto pt-3">
        {nextOffer?.startAt && (
          <p className="mb-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            {nextOffer.startAt.slice(5, 10).replace("-", "/")} {nextOffer.providerLabel} 受付开始
          </p>
        )}
        <p className="flex items-center gap-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
          <MapPin size={12} className="shrink-0" />
          <span className="truncate">{venue?.nameJa}</span>
          {pref && <span className="shrink-0 text-zinc-400">· {pref.nameZh}</span>}
        </p>
        <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <span className="text-sm font-bold tabular-nums">
            {price !== null ? <PreferencePrice amountJpy={price} suffix="〜" /> : "价格未定"}
          </span>
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            {ticketEntry ? ticketUrlKindLabel(ticketEntry.urlKind) : "演出官方来源"}
          </span>
        </div>
      </div>
    </Link>
  );
}
