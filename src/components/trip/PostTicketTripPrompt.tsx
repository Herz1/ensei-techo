"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarCheck2, Luggage } from "lucide-react";
import type { EventSummary } from "@/lib/types";
import { minPrice } from "@/components/event/status";
import { planActualTicketTotal } from "@/lib/plan";
import type { UserEventPlan } from "@/lib/store";
import { createTripPlan, useTripPlans } from "@/lib/trip-store";

export default function PostTicketTripPrompt({ event, artistName, plan }: { event: EventSummary; artistName?: string; plan: UserEventPlan }) {
  const router = useRouter();
  const eventId = event.id;
  const { trips, createTrip, addEvent } = useTripPlans();
  const [selectedTripId, setSelectedTripId] = useState("");
  const containingTrip = trips.find((trip) => trip.eventIds.includes(eventId));
  const availableTrips = trips.filter((trip) => !trip.eventIds.includes(eventId));
  const createAndOpen = () => {
    const trip = createTripPlan({
      name: `${artistName ?? event.titleJa} ${event.date.slice(5).replace("-", "/")} 远征`,
      startDate: event.date,
      eventId,
      initialTicketJpy: planActualTicketTotal(plan) ?? minPrice(event) ?? 0,
    });
    const tripId = createTrip(trip);
    if (tripId) router.push(`/trips/${tripId}`);
  };
  const addToExisting = () => {
    if (!selectedTripId) return;
    addEvent(selectedTripId, event.id, event.date);
    router.push(`/trips/${selectedTripId}`);
  };
  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-500/10">
      <p className="flex items-center gap-1.5 text-xs font-bold text-violet-700 dark:text-violet-300"><Luggage size={13} /> 票务已进入行动阶段</p>
      <p className="mt-1 text-xs text-zinc-500">现在安排交通和演出日准备；不会自动查询或预订。</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {containingTrip ? <>
          <Link href={`/trips/${containingTrip.id}`} prefetch={false} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-violet-600 px-3 text-xs font-bold text-white">打开远征 <ArrowRight size={12} /></Link>
          <Link href={`/trips/${containingTrip.id}/day`} prefetch={false} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-violet-300 px-3 text-xs font-bold text-violet-700 dark:border-violet-700 dark:text-violet-300"><CalendarCheck2 size={12} /> 演出日模式</Link>
        </> : <>
          <button type="button" onClick={createAndOpen} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-violet-600 px-3 text-xs font-bold text-white"><Luggage size={12} /> 创建远征并进入</button>
          {availableTrips.length > 0 && <div className="flex min-w-0 flex-1 gap-2"><select aria-label="中签后选择已有远征" value={selectedTripId} onChange={(input) => setSelectedTripId(input.target.value)} className="min-h-10 min-w-0 flex-1 rounded-xl border border-violet-200 bg-white px-2 text-xs dark:border-violet-800 dark:bg-zinc-900"><option value="">加入已有远征…</option>{availableTrips.map((trip) => <option key={trip.id} value={trip.id}>{trip.name}</option>)}</select><button type="button" disabled={!selectedTripId} onClick={addToExisting} className="min-h-10 rounded-xl border border-violet-300 px-3 text-xs font-bold text-violet-700 disabled:opacity-40 dark:border-violet-700 dark:text-violet-300">加入并打开</button></div>}
        </>}
      </div>
    </div>
  );
}
