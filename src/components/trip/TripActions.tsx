"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Luggage, Plus } from "lucide-react";
import type { EventSummary } from "@/lib/types";
import { minPrice } from "@/components/event/status";
import { useEventPlans, usePreferences } from "@/lib/store";
import { createTripPlan, useTripPlans } from "@/lib/trip-store";
import { planActualTicketTotal } from "@/lib/plan";

export default function TripActions({ event, artistName }: { event: EventSummary; artistName?: string }) {
  const eventId = event.id;
  const { trips, createTrip, addEvent } = useTripPlans();
  const { getPlan, upsertPlan } = useEventPlans();
  const { preferences } = usePreferences();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(() => {
    return `${artistName ?? event.titleJa} ${event.date.slice(5).replace("-", "/")} 远征`;
  });
  const [origin, setOrigin] = useState(preferences.origin ?? "");
  const [selectedTripId, setSelectedTripId] = useState("");
  const [message, setMessage] = useState("");

  const containingTrips = useMemo(
    () => trips.filter((trip) => trip.eventIds.includes(eventId)),
    [eventId, trips],
  );
  const availableTrips = trips.filter((trip) => !trip.eventIds.includes(eventId));

  const ensureEventPlan = () => {
    if (!getPlan(eventId)) upsertPlan(eventId, { intent: "committed", tripStatus: "planning" });
  };

  const handleCreate = () => {
    const plan = getPlan(eventId);
    const trip = createTripPlan({
      name,
      startDate: event.date,
      origin,
      eventId,
      initialTicketJpy: (plan ? planActualTicketTotal(plan) : null) ?? minPrice(event) ?? 0,
    });
    const tripId = createTrip(trip);
    if (!tripId) return;
    ensureEventPlan();
    setCreating(false);
    setMessage("已创建远征并加入本场公演");
  };

  const handleAdd = () => {
    if (!selectedTripId) return;
    addEvent(selectedTripId, eventId, event.date);
    ensureEventPlan();
    setMessage("已加入现有远征");
    setSelectedTripId("");
  };

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-500/5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-300">
          <Luggage size={16} /> 远征安排
        </h2>
        <Link href="/trips" prefetch={false} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-800">
          全部远征 <ArrowRight size={12} />
        </Link>
      </div>

      {containingTrips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {containingTrips.map((trip) => (
            <Link key={trip.id} href={`/trips/${trip.id}`} prefetch={false} className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-200 dark:bg-violet-500/20 dark:text-violet-200">
              <Check size={12} /> {trip.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => setCreating((value) => !value)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-700">
          <Plus size={13} /> 创建新远征
        </button>
        {availableTrips.length > 0 && (
          <div className="flex min-w-0 flex-1 gap-2">
            <select aria-label="选择已有远征" value={selectedTripId} onChange={(event) => setSelectedTripId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-violet-200 bg-white px-3 text-xs outline-none dark:border-violet-800 dark:bg-zinc-900">
              <option value="">加入已有远征…</option>
              {availableTrips.map((trip) => <option key={trip.id} value={trip.id}>{trip.name}</option>)}
            </select>
            <button type="button" disabled={!selectedTripId} onClick={handleAdd} className="rounded-xl border border-violet-300 px-3 py-2 text-xs font-bold text-violet-700 disabled:opacity-40 dark:border-violet-700 dark:text-violet-300">加入</button>
          </div>
        )}
      </div>

      {creating && (
        <div className="mt-3 grid gap-2 rounded-xl border border-violet-100 bg-white p-3 sm:grid-cols-2 dark:border-violet-900 dark:bg-zinc-900">
          <label className="text-xs font-semibold text-zinc-500">
            远征名称
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-zinc-200 px-3 text-xs outline-none focus:border-violet-400 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>
          <label className="text-xs font-semibold text-zinc-500">
            常用出发地
            <input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="未说明" className="mt-1 h-11 w-full rounded-lg border border-zinc-200 px-3 text-xs outline-none focus:border-violet-400 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>
          <button type="button" onClick={handleCreate} className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white sm:col-span-2 dark:bg-white dark:text-zinc-900">确认创建</button>
        </div>
      )}
      {message && <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{message}</p>}
    </section>
  );
}
