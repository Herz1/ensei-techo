"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarRange, Luggage, MapPin, Plus } from "lucide-react";
import { prefectureById } from "@/data/prefectures";
import type { EventSummary, VenueSummary } from "@/lib/types";
import { usePreferences } from "@/lib/store";
import { createTripPlan, useTripPlans } from "@/lib/trip-store";
import { formatJaDate, todayJst } from "@/lib/time";

const FIELD = "mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-400 dark:border-zinc-700 dark:bg-zinc-900";

export default function TripsClient({ events, venues }: { events: EventSummary[]; venues: VenueSummary[] }) {
  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const venueById = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues]);
  const { trips, createTrip } = useTripPlans();
  const { preferences } = usePreferences();
  const today = todayJst();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("新远征");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [origin, setOrigin] = useState(preferences.origin ?? "");

  const sortedTrips = [...trips].sort((left, right) =>
    left.startDate.localeCompare(right.startDate),
  );

  const handleCreate = () => {
    const trip = createTripPlan({ name, startDate, endDate, origin });
    const id = createTrip(trip);
    if (id) window.location.assign(`/trips/${id}`);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-violet-500">TRIP PLANS</p>
          <h1 className="mt-1 text-2xl font-bold">远征</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">把多场公演、交通、住宿、预算和检查事项放进同一行程。</p>
        </div>
        <button type="button" onClick={() => setCreating((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-strong">
          <Plus size={15} /> 新建远征
        </button>
      </header>

      {creating && (
        <section className="mt-5 grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 sm:grid-cols-2 dark:border-violet-900 dark:bg-violet-500/5">
          <label className="text-xs font-semibold text-zinc-500 sm:col-span-2">远征名称<input value={name} onChange={(event) => setName(event.target.value)} className={FIELD} /></label>
          <label className="text-xs font-semibold text-zinc-500">开始日期<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); if (event.target.value > endDate) setEndDate(event.target.value); }} className={FIELD} /></label>
          <label className="text-xs font-semibold text-zinc-500">结束日期<input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className={FIELD} /></label>
          <label className="text-xs font-semibold text-zinc-500 sm:col-span-2">常用出发地<input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="例如：上海虹桥 / 东京站" className={FIELD} /></label>
          <button type="button" onClick={handleCreate} className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white sm:col-span-2 dark:bg-white dark:text-zinc-900">创建并编辑行程</button>
        </section>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {sortedTrips.map((trip) => {
          const tripEvents = trip.eventIds.map((id) => eventById.get(id)).filter(Boolean);
          const missing = trip.eventIds.length - tripEvents.length;
          const prefectureNames = [...new Set(tripEvents.flatMap((event) => {
            if (!event) return [];
            const venue = venueById.get(event.venueId);
            const prefecture = venue ? prefectureById.get(venue.prefecture) : undefined;
            return prefecture ? [prefecture.nameZh] : [];
          }))];
          const done = trip.checklist.filter((item) => item.done).length;
          return (
            <Link key={trip.id} href={`/trips/${trip.id}`} prefetch={false} className="group rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-violet-300 dark:border-zinc-800 dark:bg-card-dark dark:hover:border-violet-700">
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300"><Luggage size={18} /></span>
                <ArrowRight size={15} className="text-zinc-300 transition group-hover:translate-x-1 group-hover:text-violet-500" />
              </div>
              <h2 className="mt-3 text-lg font-bold group-hover:text-brand-strong">{trip.name}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"><CalendarRange size={13} /> {formatJaDate(trip.startDate)}{trip.endDate !== trip.startDate ? ` 〜 ${formatJaDate(trip.endDate)}` : ""}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"><MapPin size={13} /> {prefectureNames.join(" · ") || "城市待添加"}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-zinc-500">
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">{trip.eventIds.length} 场公演</span>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">清单 {done}/{trip.checklist.length}</span>
                {missing > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{missing} 个缺失引用</span>}
              </div>
            </Link>
          );
        })}
      </div>
      {sortedTrips.length === 0 && (
        <p className="mt-8 rounded-3xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-400 dark:border-zinc-700">还没有远征。可在这里新建，也可从任一公演详情直接创建。</p>
      )}
    </div>
  );
}
