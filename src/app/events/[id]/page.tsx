import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Box,
  CalendarDays,
  Clock,
  ExternalLink,
  Lock,
  MapPin,
  Radio,
  Ticket,
  Train,
  Users,
} from "lucide-react";
import { artistsOf, eventById, eventsOfArtist, venueOf } from "@/data";
import {
  artistSummaries,
  eventPlanReferences,
  eventSummaries,
  eventSummaryById,
  summaryArtistsOf,
  summaryVenueOf,
  venueSummaries,
} from "@/data/client-data";
import { prefectureById } from "@/data/prefectures";
import { addDays, formatJaDate, relativeDayLabel, todayJst } from "@/lib/time";
import { formatJpy } from "@/lib/currency";
import ArtistAvatar from "@/components/ui/ArtistAvatar";
import PreferencePrice from "@/components/ui/PreferencePrice";
import StatusBadge from "@/components/event/StatusBadge";
import WantButton from "@/components/event/WantButton";
import EventActionSummary from "@/components/event/EventActionSummary";
import LocalTime from "@/components/event/LocalTime";
import EventCard from "@/components/event/EventCard";
import TourCompare from "@/components/event/TourCompare";
import TicketOffers from "@/components/event/TicketOffers";
import TripActions from "@/components/trip/TripActions";
import { TIER_LABEL, TYPE_LABEL } from "@/components/event/status";
import type { AvailabilityStatus } from "@/lib/types";

function missingFieldMessage(
  status: AvailabilityStatus,
  subject: string,
): string {
  const messages: Record<AvailabilityStatus, string> = {
    not_checked: `尚未检查可能披露${subject}的完整官方来源链。`,
    not_found_on_page: `已检查当前页面但未发现${subject}，其他关联官方来源仍可能披露。`,
    published: `${subject}已由官方来源公开。`,
    not_announced: `官方页面明确显示${subject}尚未公布。`,
    source_does_not_disclose: `当前官方来源不提供${subject}，请进入来源页确认后续更新。`,
    parser_failed: `${subject}解析失败，已进入修复队列；这不代表官方尚未公布。`,
    page_fetch_failed: `相关官方页面下载失败，暂时无法确认${subject}。`,
    blocked: `相关官方页面需要登录或验证，未尝试绕过限制。`,
    pending_review: `${subject}仍在确认中，确认前不会展示。`,
    conflicting_sources: `多个官方来源的${subject}内容不同，请查看来源确认。`,
  };
  return messages[status];
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = eventById.get(id);
  if (!event) notFound();

  const venue = venueOf(event);
  const pref = venue ? prefectureById.get(venue.prefecture) : undefined;
  const eventArtists = artistsOf(event);
  const rel = relativeDayLabel(event.date);
  const today = todayJst();
  const checkedAtJst = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
  }).format(new Date(event.verification.checkedAt));
  const availabilityValues = Object.values(event.availability);
  const verificationWarnings: string[] = [];
  if (availabilityValues.includes("conflicting_sources")) {
    verificationWarnings.push("部分官方信息存在差异，请展开来源后自行确认。");
  }
  if (availabilityValues.some((status) =>
    ["page_fetch_failed", "parser_failed", "blocked"].includes(status),
  )) {
    verificationWarnings.push("部分官方页面暂时无法读取，相关信息显示为待确认。");
  }
  if (availabilityValues.some((status) =>
    ["not_announced", "not_found_on_page", "source_does_not_disclose", "not_checked"].includes(status),
  )) {
    verificationWarnings.push("部分票务信息尚未公布或未说明。");
  }
  const verificationStale = checkedAtJst < addDays(today, -30);
  if (verificationStale) {
    verificationWarnings.push("官方信息更新时间已超过 30 天，请以来源页当前内容为准。");
  }

  const related = eventArtists
    .flatMap((a) => eventsOfArtist(a.id))
    .filter((e, i, arr) => e.id !== event.id && e.date >= today && arr.findIndex((x) => x.id === e.id) === i)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 4);
  const currentSummary = eventSummaryById.get(event.id)!;
  const compareCandidates = (currentSummary.tourName
    ? eventSummaries.filter((candidate) => candidate.tourName === currentSummary.tourName)
    : eventSummaries
        .filter((candidate) =>
          candidate.artistIds.some((artistId) => currentSummary.artistIds.includes(artistId)) &&
          Math.abs(Date.parse(`${candidate.date}T12:00:00+09:00`) - Date.parse(`${currentSummary.date}T12:00:00+09:00`)) <= 60 * 86_400_000,
        )
        .sort((left, right) => {
          if (left.id === currentSummary.id) return -1;
          if (right.id === currentSummary.id) return 1;
          return Math.abs(Date.parse(left.date) - Date.parse(currentSummary.date)) - Math.abs(Date.parse(right.date) - Date.parse(currentSummary.date));
        })
        .slice(0, 10)
  ).sort((left, right) => left.date.localeCompare(right.date));
  const compareVenueIds = new Set(compareCandidates.map((candidate) => candidate.venueId));
  const relatedSummaries = related
    .map((item) => eventSummaryById.get(item.id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <Link
        href="/events"
        prefetch={false}
        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={13} /> 返回演出列表
      </Link>

      {/* 标题区 */}
      <header className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge event={event} showZh />
          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {TYPE_LABEL[event.type]}
          </span>
          {event.streaming && (
            <span className="flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-600 dark:bg-sky-500/20 dark:text-sky-300">
              <Radio size={11} /> 有配信场
            </span>
          )}
          {event.tags.includes("本人確認あり") && (
            <span className="flex items-center gap-1 rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-600 dark:bg-orange-500/20 dark:text-orange-300">
              <Lock size={11} /> 可能查验本人确认
            </span>
          )}
        </div>
        <h1 className="mt-2.5 text-xl leading-snug font-bold sm:text-2xl">
          {event.titleJa}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {event.titleZh}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {eventArtists.slice(0, 8).map((a) => (
            <Link
              key={a.id}
              href={`/artists/${a.id}`}
              className="flex items-center gap-2 rounded-full border border-zinc-200 py-1 pr-3 pl-1 text-sm font-medium transition hover:border-violet-300 hover:text-brand-strong dark:border-zinc-700 dark:hover:border-violet-600 dark:hover:text-violet-300"
            >
              <ArtistAvatar artist={a} size={26} />
              {a.nameJa}
            </Link>
          ))}
          {eventArtists.length > 8 && (
            <span className="text-xs text-zinc-400">
              等 {eventArtists.length} 组出演
            </span>
          )}
        </div>
        <EventActionSummary event={event} />
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* 主列 */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {/* 日程 */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-card-dark">
            <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-500 dark:text-zinc-400">
              <CalendarDays size={15} /> 公演日程
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="text-2xl font-bold tabular-nums">
                {formatJaDate(event.date)}
              </p>
              {rel && (
                <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-strong dark:bg-brand/20 dark:text-violet-300">
                  {rel}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5">
                <Clock size={14} className="text-zinc-400" />
                開場 <b>{event.openTime}</b> / 開演 <b>{event.startTime}</b>
                <span className="text-xs text-zinc-400">JST</span>
              </span>
              <LocalTime date={event.date} time={event.startTime} label="开演·你的时区" />
            </div>
          </section>

          <TourCompare
            current={currentSummary}
            candidates={compareCandidates}
            eventReferences={eventPlanReferences()}
            artists={artistSummaries}
            venues={venueSummaries.filter((item) => compareVenueIds.has(item.id))}
          />

          <TicketOffers event={event} />

          <WantButton eventId={event.id} event={event} artistName={eventArtists[0]?.nameJa} full />

          <TripActions event={event} artistName={eventArtists[0]?.nameJa} />

          {/* 票价 */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-card-dark">
            <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-500 dark:text-zinc-400">
              <Ticket size={15} /> 席种与票价
              <span className="text-xs font-normal">含税状态以官方标注为准 · 参考汇率非实时</span>
            </h2>
            <div className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
              {event.tiers.map((t, index) => (
                <div key={`${t.name}-${index}`} className="flex items-baseline gap-3 py-2.5">
                  <span className="text-sm font-semibold">{t.name}</span>
                  {t.note && (
                    <span className="text-xs text-zinc-400">{t.note}</span>
                  )}
                  <span className="text-xs text-zinc-400">
                    {t.taxIncluded === true
                      ? "税込"
                      : t.taxIncluded === false
                        ? "税別"
                        : "税状态未标注"}
                  </span>
                  <PreferencePrice
                    amountJpy={t.priceJpy}
                    className="text-base font-bold tabular-nums"
                    referenceClassName="mt-1 text-right text-xs font-normal text-zinc-400 tabular-nums"
                  />
                </div>
              ))}
            </div>
            {event.tiers.length === 0 && (
              <p className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
                {missingFieldMessage(event.availability.prices, "票价")}
              </p>
            )}
            {event.additionalFees.length > 0 && (
              <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <p className="font-bold">官方明确列出的额外费用</p>
                {event.additionalFees.map((fee) => (
                  <p key={`${fee.type}-${fee.label}`} className="mt-1">
                    {fee.label}：
                    {fee.amountJpy === null ? "金额未公开" : formatJpy(fee.amountJpy)}
                    {fee.required ? "（需另付）" : ""}
                  </p>
                ))}
              </div>
            )}
            {event.streaming && (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-sky-50 p-3 text-sm dark:bg-sky-500/10">
                <Radio size={16} className="shrink-0 text-sky-500" />
                <div className="flex-1">
                  <p className="font-semibold text-sky-700 dark:text-sky-300">
                    线上配信 · {event.streaming.platform}
                  </p>
                  <p className="text-xs text-sky-600/80 dark:text-sky-400/80">
                    已确认存在配信；海外购买资格未说明，请以官方配信页面为准。
                  </p>
                </div>
                <PreferencePrice
                  amountJpy={event.streaming.priceJpy}
                  className="font-bold tabular-nums"
                  referenceClassName="mt-1 text-right text-xs font-normal text-zinc-400"
                />
              </div>
            )}
          </section>
        </div>

        {/* 侧列:场地 */}
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-card-dark">
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">演出官方来源</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${verificationStale ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"}`}>
                最近核验 {checkedAtJst}{verificationStale ? " · 可能过旧" : ""}
              </span>
            </div>
            {verificationWarnings.length > 0 && (
              <div className="mt-3 space-y-1 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {verificationWarnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            )}
            <details className="group mt-3">
              <summary className="cursor-pointer list-none text-xs font-bold text-zinc-600 hover:text-violet-700 dark:text-zinc-300 dark:hover:text-violet-300">
                查看来源（{event.verification.sources.length}）
              </summary>
              <div className="mt-2 space-y-2">
                {event.verification.sources.map((source) => (
                  <a
                    key={`${source.type}-${source.url}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:text-brand-strong dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-violet-300"
                  >
                    <span className="truncate">{source.name}</span>
                    <ExternalLink size={12} className="shrink-0" />
                  </a>
                ))}
              </div>
            </details>
          </section>
          {venue && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-card-dark">
              <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-500 dark:text-zinc-400">
                <MapPin size={15} /> 场地
              </h2>
              <Link
                href={`/venues/${venue.id}`}
                className="mt-2 block font-bold hover:text-brand-strong dark:hover:text-violet-300"
              >
                {venue.nameJa}
                <ExternalLink size={12} className="ml-1 inline text-zinc-400" />
              </Link>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {[venue.nameZh, pref?.nameZh, venue.city].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-2 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium dark:bg-zinc-800">
                  {venue.tier ? TIER_LABEL[venue.tier] : "资料待补全"}
                </span>
                {venue.capacity !== null && (
                  <span className="flex items-center gap-1">
                    <Users size={12} /> 收容约 {venue.capacity.toLocaleString()} 人
                  </span>
                )}
              </p>

              <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <p className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400">
                  <Train size={13} /> 交通アクセス
                </p>
                {venue.stations.map((s) => (
                  <p key={s.line + s.station} className="text-xs text-zinc-600 dark:text-zinc-300">
                    <span className="text-zinc-400">{s.line}</span>{" "}
                    <b>{s.station}</b> 徒步 {s.walkMin} 分
                  </p>
                ))}
                {venue.hubAccess.map((h) => (
                  <p key={h.from} className="text-xs text-zinc-400">
                    {h.from} 出发:{h.route}(约 {h.min} 分)
                  </p>
                ))}
                {venue.lockers && (
                  <p className="rounded-lg bg-amber-50 p-2 text-xs leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    🧳 寄物柜:{venue.lockers}
                  </p>
                )}
                {venue.notes && (
                  <p className="text-xs leading-relaxed text-zinc-400">
                    💡 {venue.notes}
                  </p>
                )}
              </div>

              {venue.model3d && (
                <Link
                  href={`/venues/${venue.id}/3d`}
                  className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700"
                >
                  <Box size={16} /> 3D 座位视野模拟
                </Link>
              )}
            </section>
          )}

          {related.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold text-zinc-500 dark:text-zinc-400">
                同艺人其他公演
              </h2>
              <div className="flex snap-x gap-3 overflow-x-auto pb-2 scrollbar-hide lg:flex-col lg:overflow-visible">
                {relatedSummaries.map((e) => (
                  <EventCard key={e.id} event={e} artists={summaryArtistsOf(e)} venue={summaryVenueOf(e)} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
