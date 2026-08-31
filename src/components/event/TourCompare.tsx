"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarRange, Check, MapPin, Users } from "lucide-react";
import { prefectureById } from "@/data/prefectures";
import type { ArtistSummary, EventPlanReference, EventSummary, VenueSummary } from "@/lib/types";
import { formatJpy } from "@/lib/currency";
import { planStatusLabel } from "@/lib/plan";
import { useEventPlans } from "@/lib/store";
import { formatJaDate } from "@/lib/time";
import { minPrice } from "./status";
import { getNextTicketAction } from "@/lib/ticket-offer";

export default function TourCompare({
  current,
  candidates,
  eventReferences,
  artists,
  venues,
}: {
  current: EventSummary;
  candidates: EventSummary[];
  eventReferences: EventPlanReference[];
  artists: ArtistSummary[];
  venues: VenueSummary[];
}) {
  const { plans } = useEventPlans();
  const candidateById = useMemo(() => new Map(candidates.map((event) => [event.id, event])), [candidates]);
  const venueById = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues]);
  const artistById = useMemo(() => new Map(artists.map((artist) => [artist.id, artist])), [artists]);
  const referenceById = useMemo(() => new Map(eventReferences.map((event) => [event.id, event])), [eventReferences]);
  const [selectedIds, setSelectedIds] = useState(() =>
    candidates.slice(0, Math.min(3, candidates.length)).map((event) => event.id),
  );

  if (candidates.length < 2) return null;
  const confirmedTour = Boolean(current.tourName);
  const selected = selectedIds
    .map((id) => candidateById.get(id))
    .filter((event): event is NonNullable<typeof event> => Boolean(event));
  const planById = new Map(plans.map((plan) => [plan.eventId, plan]));
  const plannedEvents = plans
    .map((plan) => referenceById.get(plan.eventId))
    .filter((event): event is NonNullable<typeof event> => Boolean(event));

  const toggle = (candidateId: string) => {
    if (candidateId === current.id) return;
    setSelectedIds((ids) => {
      // 比较面板约定至少保留两场，避免出现只有单场的“比较”结果。
      if (ids.includes(candidateId)) return ids.length <= 2 ? ids : ids.filter((id) => id !== candidateId);
      if (ids.length >= 3) return ids;
      return [...ids, candidateId];
    });
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-card-dark">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-600 dark:text-zinc-300">
            <CalendarRange size={16} />
            {confirmedTour ? "巡演场次比较" : "相关场次比较"}
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            {confirmedTour
              ? `按相同 tourName「${current.tourName}」归组。`
              : "没有 tourName；以下仅为相同艺人、日期接近的相关场次，不代表已确认属于同一巡演。"}
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          选择 2–3 场
        </span>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {candidates.map((event) => {
          const active = selectedIds.includes(event.id);
          return (
            <button
              key={event.id}
              type="button"
              aria-pressed={active}
              disabled={
                event.id === current.id ||
                (active && selectedIds.length <= 2) ||
                (!active && selectedIds.length >= 3)
              }
              onClick={() => toggle(event.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${
                active
                  ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                  : "border-zinc-200 text-zinc-500 disabled:opacity-40 dark:border-zinc-700"
              }`}
            >
              {active && <Check size={11} />}{event.date.slice(5).replace("-", "/")}
              {event.id === current.id ? " · 当前" : ""}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {selected.map((event) => {
          const venue = venueById.get(event.venueId);
          const prefecture = venue ? prefectureById.get(venue.prefecture) : undefined;
          const price = minPrice(event);
          const plan = planById.get(event.id);
          const next = getNextTicketAction(event, plan);
          const conflictingPlans = plannedEvents.filter(
            (planned) => planned.id !== event.id && planned.date === event.date,
          );
          const selectedSameDay = selected.some(
            (other) => other.id !== event.id && other.date === event.date,
          );
          return (
            <article key={event.id} className="rounded-2xl border border-zinc-200 p-3.5 dark:border-zinc-700">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold tabular-nums">{formatJaDate(event.date)}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{event.openTime} 开场 · {event.startTime} 开演 JST</p>
                </div>
                {plan && <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{planStatusLabel(plan)}</span>}
              </div>
              <Link href={`/events/${event.id}`} prefetch={false} className="mt-3 block text-sm font-semibold hover:text-brand-strong">
                {event.titleJa}
              </Link>
              <p className="mt-2 flex items-start gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <MapPin size={12} className="mt-0.5 shrink-0" />
                <span>{[prefecture?.nameZh, venue?.city, venue?.nameJa].filter(Boolean).join(" · ") || "场馆待确认"}</span>
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <Users size={12} /> {venue?.capacity ? `约 ${venue.capacity.toLocaleString()} 人` : "容量待确认"}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-zinc-50 p-2.5 text-xs dark:bg-zinc-800/60">
                <div><dt className="text-zinc-400">最低票价</dt><dd className="mt-0.5 font-bold">{price === null ? "待确认" : `${formatJpy(price)} 起`}</dd></div>
                <div><dt className="text-zinc-400">票务下一步</dt><dd className="mt-0.5 font-bold">{next.label}{next.dueAt ? ` · ${next.dueAt.slice(0, 10).replaceAll("-", "/")}` : " · 时间未说明"}</dd></div>
              </dl>
              {(conflictingPlans.length > 0 || selectedSameDay) && (
                <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {conflictingPlans.length > 0
                    ? `与已有计划同日：${conflictingPlans.map((item) => item.artistIds.map((id) => artistById.get(id)?.nameJa).filter(Boolean).join(" / ") || item.titleJa).join("、")}`
                    : "与当前选择的另一场公演同日，请确认时间。"}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
